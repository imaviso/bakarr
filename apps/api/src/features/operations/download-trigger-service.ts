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
import {
  appendLog,
  loadMissingEpisodeNumbers,
  nowIso,
  recordDownloadEvent,
} from "./job-support.ts";
import { randomHex } from "../../lib/random.ts";
import { parseReleaseName } from "./release-ranking.ts";
import {
  DownloadConflictError,
  ExternalCallError,
  type OperationsError,
  OperationsInputError,
} from "./errors.ts";
import type { TryDatabasePromise } from "./service-support.ts";
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
    const contexts = yield* tryDatabasePromise("Failed to load download progress snapshot", () =>
      loadDownloadPresentationContexts(db, rows),
    );
    return yield* Effect.forEach(rows, (row) =>
      randomHex(20).pipe(
        Effect.map((fallbackHash) =>
          toDownloadStatus(row, () => fallbackHash, contexts.get(row.id)),
        ),
      ),
    );
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

  const triggerDownload = Effect.fn("OperationsService.triggerDownload")(function* (
    input: TriggerDownloadInput,
  ) {
    return yield* coordination.runSerializedTrigger(
      Effect.gen(function* () {
        const animeRow = yield* requireAnime(db, input.anime_id);

        const now = yield* nowIso;
        const runtimeConfig = yield* loadRuntimeConfig(db);
        const parsedRelease = parseReleaseName(input.title);
        const effectiveIsBatch = input.is_batch ?? parsedRelease.isBatch;
        const requestedEpisode = resolveRequestedEpisodeNumber({
          explicitEpisode: input.episode_number,
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
        const shouldDeferBatchCoverage =
          effectiveIsBatch && parsedRelease.episodeNumbers.length === 0;
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
              input.release_metadata?.chosen_from_seadex ?? input.release_metadata?.is_seadex,
            decisionReason: input.decision_reason,
            group: input.group,
            indexer: "Nyaa",
            previousQuality: input.release_metadata?.previous_quality,
            previousScore: input.release_metadata?.previous_score,
            selectionKind: input.release_metadata?.selection_kind ?? "manual",
            selectionScore: input.release_metadata?.selection_score,
            sourceUrl: input.release_metadata?.source_url,
            title: input.title,
          }),
          input.release_metadata,
        );
        const infoHash =
          (input.info_hash ?? parseMagnetInfoHash(input.magnet))?.toLowerCase() ?? null;

        const insertResult = yield* Effect.either(
          tryDatabasePromise("Failed to trigger download", () =>
            db.transaction(
              async (tx) => {
                if (infoHash) {
                  const overlapping = await hasOverlappingDownload(
                    tx as unknown as AppDatabase,
                    animeRow.id,
                    infoHash,
                    inferredCoveredEpisodes,
                  );

                  if (overlapping) {
                    return { _tag: "overlap" } as const;
                  }
                }

                const inserted = await tx
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
                    groupName: input.group ?? null,
                    infoHash,
                    lastSyncedAt: now,
                    magnet: input.magnet,
                    progress: 0,
                    savePath: null,
                    speedBytes: 0,
                    sourceMetadata: encodeDownloadSourceMetadata(sourceMetadata),
                    status: "queued",
                    totalBytes: null,
                    torrentName: input.title,
                  })
                  .returning({ id: downloads.id });

                return {
                  _tag: "inserted",
                  id: inserted[0].id,
                } as const;
              },
              { behavior: "immediate" },
            ),
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

        if (insertResult.right._tag === "overlap") {
          return yield* new DownloadConflictError({
            message: "An in-flight download already covers these episodes",
          });
        }

        const insertedId = insertResult.right.id;
        let status = "queued";
        const qbitConfig = maybeQBitConfig(runtimeConfig);

        if (qbitConfig && input.magnet) {
          const qbitResult = yield* Effect.either(
            qbitClient.addTorrentUrl(qbitConfig, input.magnet),
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
        yield* recordDownloadEvent(db, {
          animeId: animeRow.id,
          downloadId: insertedId,
          eventType: "download.queued",
          metadataJson: {
            covered_episodes: inferredCoveredEpisodes,
            source_metadata: sourceMetadata,
          },
          message: `Queued ${input.title}`,
          metadata: coveredEpisodes,
          toStatus: status,
        });
        yield* appendLog(
          db,
          "downloads.triggered",
          "success",
          shouldDeferBatchCoverage
            ? `Queued batch download for ${animeRow.titleRomaji}; waiting for qBittorrent metadata to determine covered episodes`
            : `Queued download for ${animeRow.titleRomaji} episode ${requestedEpisode}`,
        );
        yield* eventBus.publish({
          type: "DownloadStarted",
          payload: {
            anime_id: animeRow.id,
            source_metadata: sourceMetadata,
            title: input.title,
          },
        });
        yield* publishDownloadProgress();
      }).pipe(Effect.withSpan("operations.downloads.trigger")),
    );
  });

  return {
    getDownloadProgressSnapshotEffect,
    publishDownloadProgress,
    triggerDownload,
  };
}
