import { Context, Effect, Layer } from "effect";
import { eq } from "drizzle-orm";

import { DatabaseError } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { loadRuntimeConfig } from "@/features/operations/repository/config-repository.ts";
import { encodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import {
  buildDownloadSourceMetadataFromRelease,
  mergeDownloadSourceMetadata,
} from "@/features/operations/naming-support.ts";
import {
  hasOverlappingDownload,
  inferCoveredEpisodeNumbers,
  toCoveredEpisodesJson,
} from "@/features/operations/download-coverage.ts";
import { parseMagnetInfoHash } from "@/features/operations/download-paths.ts";
import {
  appendLog,
  loadMissingEpisodeNumbers,
  recordDownloadEvent,
} from "@/features/operations/job-support.ts";
import { parseReleaseName } from "@/features/operations/release-ranking.ts";
import {
  DownloadConflictError,
  OperationsInputError,
  OperationsInfrastructureError,
} from "@/features/operations/errors.ts";
import type { TriggerDownloadInput } from "@/features/operations/download-orchestration-shared.ts";
import { resolveRequestedEpisodeNumber } from "@/features/operations/download-orchestration-shared.ts";
import type { QBitConfig } from "@/features/operations/qbittorrent.ts";
import type { DownloadTriggerCoordinatorShape } from "@/features/operations/runtime-support.ts";
import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { maybeQBitConfig } from "@/features/operations/operations-qbit-config.ts";
import { DownloadProgressSupport } from "@/features/operations/download-progress-support.ts";
import { DownloadTriggerCoordinator } from "@/features/operations/runtime-support.ts";

export function makeDownloadTriggerService(input: {
  readonly db: import("@/db/database.ts").AppDatabase;
  readonly qbitClient: typeof QBitTorrentClient.Service;
  readonly eventBus: typeof EventBus.Service;
  readonly tryDatabasePromise: import("@/lib/effect-db.ts").TryDatabasePromise;
  readonly maybeQBitConfig: (
    config: import("@packages/shared/index.ts").Config,
  ) => QBitConfig | null;
  readonly nowIso: () => Effect.Effect<string>;
  readonly downloadTriggerCoordinator: DownloadTriggerCoordinatorShape;
  readonly publishDownloadProgress: () => Effect.Effect<
    void,
    DatabaseError | OperationsInfrastructureError
  >;
}) {
  const {
    db,
    qbitClient,
    eventBus,
    tryDatabasePromise,
    maybeQBitConfig: maybeQBitConfigFromInput,
    downloadTriggerCoordinator,
    publishDownloadProgress,
  } = input;
  const { nowIso } = input;

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
    const qbitConfig: QBitConfig | null = maybeQBitConfigFromInput(runtimeConfig);

    if (qbitConfig && triggerInput.magnet) {
      const qbitResult = yield* Effect.either(
        qbitClient.addTorrentUrl(qbitConfig, triggerInput.magnet),
      );

      if (qbitResult._tag === "Left") {
        yield* tryDatabasePromise("Cleanup failed download", () =>
          db.delete(downloads).where(eq(downloads.id, insertedId)),
        );
        return yield* new OperationsInfrastructureError({
          message: "Failed to trigger download",
          cause: qbitResult.left,
        });
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
    return yield* downloadTriggerCoordinator.runExclusiveDownloadTrigger(
      executeTriggerDownload(input).pipe(Effect.withSpan("operations.downloads.trigger")),
    );
  });

  return {
    triggerDownload,
  };
}

export type DownloadTriggerServiceShape = ReturnType<typeof makeDownloadTriggerService>;

export class DownloadTriggerService extends Context.Tag("@bakarr/api/DownloadTriggerService")<
  DownloadTriggerService,
  DownloadTriggerServiceShape
>() {}

export const DownloadTriggerServiceLive = Layer.effect(
  DownloadTriggerService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const qbitClient = yield* QBitTorrentClient;
    const clock = yield* ClockService;
    const progressSupport = yield* DownloadProgressSupport;
    const downloadTriggerCoordinator = yield* DownloadTriggerCoordinator;

    return makeDownloadTriggerService({
      db,
      downloadTriggerCoordinator,
      eventBus,
      maybeQBitConfig,
      nowIso: () => nowIsoFromClock(clock),
      publishDownloadProgress: progressSupport.publishDownloadProgress,
      qbitClient,
      tryDatabasePromise,
    });
  }),
);
