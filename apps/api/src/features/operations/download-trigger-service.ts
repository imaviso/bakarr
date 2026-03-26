import { desc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { downloads } from "../../db/schema.ts";
import { EventBus } from "../events/event-bus.ts";
import {
  encodeDownloadSourceMetadata,
  loadDownloadPresentationContexts,
  loadRuntimeConfig,
  requireAnime,
  toDownloadStatus,
} from "./repository.ts";
import {
  buildDownloadSourceMetadataFromRelease,
  mergeDownloadSourceMetadata,
} from "./naming-support.ts";
import {
  hasOverlappingDownload,
  inferCoveredEpisodeNumbers,
  parseMagnetInfoHash,
  toCoveredEpisodesJson,
} from "./download-lifecycle.ts";
import { appendLog, loadMissingEpisodeNumbers, recordDownloadEvent } from "./job-support.ts";
import { parseReleaseName } from "./release-ranking.ts";
import { DownloadConflictError, type OperationsError, OperationsInputError } from "./errors.ts";
import type { ExternalCallError } from "../../lib/effect-retry.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import type { TriggerDownloadInput } from "./download-orchestration-shared.ts";
import { resolveRequestedEpisodeNumber } from "./download-orchestration-shared.ts";

export function makeDownloadTriggerService(input: {
  readonly db: AppDatabase;
  readonly qbitClient: typeof QBitTorrentClient.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
  readonly dbError: (message: string) => (cause: unknown) => DatabaseError;
  readonly maybeQBitConfig: (
    config: import("../../../../../packages/shared/src/index.ts").Config,
  ) => QBitConfig | null;
  readonly nowIso: () => Effect.Effect<string>;
  readonly coordination: import("./runtime-support.ts").OperationsCoordinationShape;
  readonly syncDownloadsWithQBitEffect: () => Effect.Effect<
    void,
    ExternalCallError | OperationsError | DatabaseError
  >;
}) {
  const {
    db,
    qbitClient,
    eventBus,
    tryDatabasePromise,
    wrapOperationsError,
    dbError,
    maybeQBitConfig,
    coordination,
    syncDownloadsWithQBitEffect,
  } = input;
  const { nowIso } = input;

  const getDownloadProgressSnapshotEffect = Effect.fn(
    "OperationsService.getDownloadProgressSnapshot",
  )(function* () {
    yield* syncDownloadsWithQBitEffect();
    const rows = yield* tryDatabasePromise("Failed to load download progress snapshot", () =>
      db
        .select()
        .from(downloads)
        .where(inArray(downloads.status, ["queued", "downloading", "paused"]))
        .orderBy(desc(downloads.id)),
    );
    const contexts = yield* loadDownloadPresentationContexts(db, rows);
    return yield* Effect.forEach(rows, (row) => toDownloadStatus(row, contexts.get(row.id)));
  });

  const publishDownloadProgress = Effect.fn("OperationsService.publishDownloadProgress")(
    function* () {
      const downloads = yield* getDownloadProgressSnapshotEffect().pipe(
        Effect.catchAll((error) =>
          error instanceof DatabaseError
            ? Effect.fail(error)
            : Effect.fail(dbError("Failed to load download progress snapshot")(error)),
        ),
      );

      yield* eventBus.publish({
        type: "DownloadProgress",
        payload: { downloads },
      });
    },
  );

  const executeTriggerDownload = Effect.fn("OperationsService.executeTriggerDownload")(function* (
    triggerInput: TriggerDownloadInput,
  ) {
    const animeRow = yield* requireAnime(db, triggerInput.anime_id);

    const now = yield* nowIso();
    const runtimeConfig = yield* loadRuntimeConfig(db);
    const parsedRelease = parseReleaseName(triggerInput.title);
    const effectiveIsBatch = triggerInput.is_batch ?? parsedRelease.isBatch;
    const requestedEpisode = resolveRequestedEpisodeNumber({
      explicitEpisode: triggerInput.episode_number,
      inferredEpisodes: parsedRelease.episodeNumbers,
      isBatch: effectiveIsBatch,
    });

    if (!requestedEpisode) {
      return yield* new OperationsInputError({
        message:
          "episode_number is required when the release title does not include episode information",
      });
    }

    const missingEpisodes = yield* loadMissingEpisodeNumbers(db, animeRow.id);
    const shouldDeferBatchCoverage = effectiveIsBatch && parsedRelease.episodeNumbers.length === 0;
    const inferredCoveredEpisodes = shouldDeferBatchCoverage
      ? []
      : inferCoveredEpisodeNumbers({
          explicitEpisodes: parsedRelease.episodeNumbers,
          isBatch: effectiveIsBatch,
          totalEpisodes: animeRow.episodeCount,
          missingEpisodes,
          requestedEpisode,
        });
    const coveredEpisodes = toCoveredEpisodesJson(inferredCoveredEpisodes);
    const sourceMetadata = mergeDownloadSourceMetadata(
      buildDownloadSourceMetadataFromRelease({
        chosenFromSeadex:
          triggerInput.release_metadata?.chosen_from_seadex ??
          triggerInput.release_metadata?.is_seadex,
        decisionReason: triggerInput.decision_reason,
        group: triggerInput.group,
        indexer: "Nyaa",
        previousQuality: triggerInput.release_metadata?.previous_quality,
        previousScore: triggerInput.release_metadata?.previous_score,
        selectionKind: triggerInput.release_metadata?.selection_kind ?? "manual",
        selectionScore: triggerInput.release_metadata?.selection_score,
        sourceUrl: triggerInput.release_metadata?.source_url,
        title: triggerInput.title,
      }),
      triggerInput.release_metadata,
    );
    const infoHash =
      (triggerInput.info_hash ?? parseMagnetInfoHash(triggerInput.magnet))?.toLowerCase() ?? null;

    if (infoHash) {
      const overlapping = yield* hasOverlappingDownload(
        db,
        animeRow.id,
        infoHash,
        inferredCoveredEpisodes,
      );

      if (overlapping) {
        return yield* new DownloadConflictError({
          message: "An in-flight download already covers these episodes",
        });
      }
    }

    const insertResult = yield* Effect.either(
      tryDatabasePromise("Failed to trigger download", () =>
        db
          .insert(downloads)
          .values({
            addedAt: now,
            animeId: animeRow.id,
            animeTitle: animeRow.titleRomaji,
            contentPath: null,
            coveredEpisodes,
            downloadDate: null,
            episodeNumber: requestedEpisode,
            isBatch: effectiveIsBatch,
            downloadedBytes: 0,
            errorMessage: null,
            etaSeconds: null,
            externalState: "queued",
            groupName: triggerInput.group ?? null,
            infoHash,
            lastSyncedAt: now,
            magnet: triggerInput.magnet,
            progress: 0,
            savePath: null,
            speedBytes: 0,
            sourceMetadata: encodeDownloadSourceMetadata(sourceMetadata),
            status: "queued",
            totalBytes: null,
            torrentName: triggerInput.title,
          })
          .returning({ id: downloads.id }),
      ),
    );

    if (insertResult._tag === "Left") {
      const insertError = insertResult.left;
      if (insertError instanceof DatabaseError && insertError.isUniqueConstraint()) {
        return yield* new DownloadConflictError({
          message: "Download already exists",
        });
      }
      return yield* insertError;
    }

    const insertedId = insertResult.right[0].id;
    let status = "queued";
    const qbitConfig = maybeQBitConfig(runtimeConfig);

    if (qbitConfig && triggerInput.magnet) {
      const qbitResult = yield* Effect.either(
        qbitClient.addTorrentUrl(qbitConfig, triggerInput.magnet),
      );

      if (qbitResult._tag === "Left") {
        yield* tryDatabasePromise("Cleanup failed download", () =>
          db.delete(downloads).where(eq(downloads.id, insertedId)),
        );
        return yield* wrapOperationsError("Failed to trigger download")(qbitResult.left);
      }

      status = "downloading";
      yield* tryDatabasePromise("Update download status", () =>
        db
          .update(downloads)
          .set({ status, externalState: status })
          .where(eq(downloads.id, insertedId)),
      );
    }
    yield* recordDownloadEvent(
      db,
      {
        animeId: animeRow.id,
        downloadId: insertedId,
        eventType: "download.queued",
        metadataJson: {
          covered_episodes: inferredCoveredEpisodes,
          source_metadata: sourceMetadata,
        },
        message: `Queued ${triggerInput.title}`,
        metadata: coveredEpisodes,
        toStatus: status,
      },
      nowIso,
    );
    yield* appendLog(
      db,
      "downloads.triggered",
      "success",
      shouldDeferBatchCoverage
        ? `Queued batch download for ${animeRow.titleRomaji}; waiting for qBittorrent metadata to determine covered episodes`
        : `Queued download for ${animeRow.titleRomaji} episode ${requestedEpisode}`,
      nowIso,
    );
    yield* eventBus.publish({
      type: "DownloadStarted",
      payload: {
        anime_id: animeRow.id,
        source_metadata: sourceMetadata,
        title: triggerInput.title,
      },
    });
    yield* publishDownloadProgress();
  });

  const triggerDownload = Effect.fn("OperationsService.triggerDownload")(function* (
    input: TriggerDownloadInput,
  ) {
    return yield* coordination.runExclusiveDownloadTrigger(
      executeTriggerDownload(input).pipe(Effect.withSpan("operations.downloads.trigger")),
    );
  });

  return {
    getDownloadProgressSnapshotEffect,
    publishDownloadProgress,
    triggerDownload,
  };
}
