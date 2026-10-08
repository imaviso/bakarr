// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)

import type {
  AsyncOperationAccepted,
  Config,
  DownloadSourceMetadata,
} from "@packages/shared/index.ts";
import type { downloads } from "@/db/schema.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import {
  inferCoveredUnitsFromTorrentContents,
  parseCoveredUnitsEffect,
  toCoveredUnitsJson,
} from "@/features/operations/download/download-coverage.ts";
import {
  buildDownloadImportEventMetadata,
  isStaleReconcileClaim,
} from "@/features/operations/download/download-import-meta.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import {
  decodeDownloadSourceMetadata,
  type DownloadEventRecordInput,
} from "@/features/operations/repository/download-repository.ts";
import {
  DownloadRepository,
  type TorrentSyncUpdate,
} from "@/features/operations/repository/download-repository.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { TorrentClientService } from "@/features/operations/torrent/torrent-client-service.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import type { TorrentFile } from "@/features/operations/torrent/torrent-domain.ts";
import { DownloadReconciliationService } from "@/features/operations/download/download-reconciliation-service.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { DatabaseError } from "@/db/database.ts";
import { InfrastructureError } from "@/features/errors.ts";
import { Context, Duration, Effect, Layer, Option, Semaphore } from "effect";
import { errorLogAnnotations } from "@/infra/logging.ts";

function shouldReconcileCompletedDownloads(config: Config | null) {
  return config?.downloads.reconcile_completed_downloads ?? true;
}

const TORRENT_SYNC_UPDATE_CHUNK_SIZE = 50;
const TORRENT_CONTENTS_REFINE_CONCURRENCY = 4;
/** A queued row absent from the torrent client for this long is considered lost. */
const STALE_QUEUED_THRESHOLD_MS = 10 * 60 * 1000;

/** Job-edge union — reconcile domain tags collapsed for background sync. */
export type DownloadTorrentSyncError = DatabaseError | InfrastructureError;

export interface DownloadTorrentSyncServiceShape {
  readonly startDownloadSync: () => Effect.Effect<
    AsyncOperationAccepted,
    DatabaseError | InfrastructureError
  >;
  readonly syncDownloads: () => Effect.Effect<void, DownloadTorrentSyncError>;
  readonly syncDownloadsWithQBitEffect: () => Effect.Effect<void, DownloadTorrentSyncError>;
}

const mapSyncError = (error: unknown): DownloadTorrentSyncError =>
  error instanceof DatabaseError
    ? error
    : new InfrastructureError({
        message: "Download torrent sync failed",
        cause: error,
      });

const failureTagOf = (error: unknown): string => {
  const tag =
    error !== null && typeof error === "object" && "_tag" in error
      ? Reflect.get(error, "_tag")
      : undefined;
  return typeof tag === "string" ? tag : "Unknown";
};

export class DownloadTorrentSyncService extends Context.Service<
  DownloadTorrentSyncService,
  DownloadTorrentSyncServiceShape
>()("@bakarr/api/DownloadTorrentSyncService") {
  static readonly layer = Layer.effect(
    DownloadTorrentSyncService,
    Effect.gen(function* () {
      const syncRepo = yield* DownloadRepository;
      const mediaRepository = yield* MediaRepository;
      const torrentClientService = yield* TorrentClientService;
      const reconciliationService = yield* DownloadReconciliationService;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
      const eventBus = yield* EventBus;
      const progress = yield* OperationsProgress;
      const taskLauncher = yield* OperationsTaskLauncherService;
      const syncSemaphore = yield* Semaphore.make(1);
      // Single-fetch cache (Q4): batch coverage refinement already lists each
      // torrent's files; the reconcile loop below reuses the same lists
      // instead of calling the client a second time for the same hash.
      // Absent = not fetched (fetch on demand); null = unavailable (unscoped).
      const torrentContentsCache = new Map<string, readonly TorrentFile[] | null>();

      const refineBatchCoverageFromTorrentFiles = Effect.fn(
        "TorrentSync.refineBatchCoverageFromTorrentFiles",
      )(function* (refineInput: {
        mediaId: number;
        downloadId: number;
        existingCoveredEpisodes: string | null;
        infoHash: string;
        sourceMetadata?: DownloadSourceMetadata;
        torrentName: string;
      }) {
        const contentsResult = yield* torrentClientService
          .listTorrentContentsIfEnabled(refineInput.infoHash)
          .pipe(Effect.result);

        if (contentsResult._tag === "Failure") {
          torrentContentsCache.set(refineInput.infoHash, null);
          yield* Effect.logDebug("Failed to inspect torrent file list").pipe(
            Effect.annotateLogs({
              downloadId: refineInput.downloadId,
              error: globalThis.String(contentsResult.failure),
              infoHash: refineInput.infoHash,
            }),
          );
          return;
        }

        if (contentsResult.success._tag === "Disabled") {
          torrentContentsCache.set(refineInput.infoHash, null);
          return;
        }

        torrentContentsCache.set(refineInput.infoHash, contentsResult.success.files);

        const mediaRowOption = yield* mediaRepository
          .getMediaRow(refineInput.mediaId)
          .pipe(Effect.option);
        const inferredEpisodes = inferCoveredUnitsFromTorrentContents({
          files: contentsResult.success.files,
          parseVolumeNumbers: Option.match(mediaRowOption, {
            onNone: () => true,
            onSome: (row) => row.mediaKind !== "anime",
          }),
          rootName: refineInput.torrentName,
        });

        if (inferredEpisodes.length === 0) {
          return;
        }

        const currentEpisodes = yield* parseCoveredUnitsEffect(refineInput.existingCoveredEpisodes);
        if (
          currentEpisodes.length === inferredEpisodes.length &&
          currentEpisodes.every((episode, index) => episode === inferredEpisodes[index])
        ) {
          return;
        }

        const encodedInferredEpisodes = yield* toCoveredUnitsJson(inferredEpisodes);

        yield* syncRepo.updateDownloadCoveredUnits({
          coveredUnits: encodedInferredEpisodes,
          downloadId: refineInput.downloadId,
          isBatch: inferredEpisodes.length > 1,
          unitNumber: inferredEpisodes[0] ?? 1,
        });

        const coverageNow = yield* currentNowIso();
        const eventMetadata = yield* buildDownloadImportEventMetadata({
          coveredUnitsJson: encodedInferredEpisodes,
          ...(refineInput.sourceMetadata ? { sourceMetadata: refineInput.sourceMetadata } : {}),
        });
        yield* syncRepo.insertDownloadEvent(
          {
            mediaId: refineInput.mediaId,
            downloadId: refineInput.downloadId,
            eventType: "download.coverage_refined",
            metadata: eventMetadata,
            message: `Refined batch mediaUnits from torrent file list: ${inferredEpisodes.join(", ")}`,
          },
          coverageNow,
        );
      });

      const updateDownloadsFromTorrentRows = Effect.fn(
        "TorrentSync.updateDownloadsFromTorrentRows",
      )(function* (
        rows: readonly TorrentSyncUpdate[],
        eventsByHash: ReadonlyMap<string, DownloadEventRecordInput>,
        syncNow: string,
      ) {
        for (let index = 0; index < rows.length; index += TORRENT_SYNC_UPDATE_CHUNK_SIZE) {
          const chunk = rows.slice(index, index + TORRENT_SYNC_UPDATE_CHUNK_SIZE);
          const chunkHashes = new Set(chunk.map((row) => row.hash));
          const chunkEvents = [...eventsByHash].flatMap(([hash, event]) =>
            chunkHashes.has(hash) ? [event] : [],
          );
          yield* syncRepo.bulkUpdateTorrentSyncRows(chunk, chunkEvents, syncNow);
        }
      });

      const buildStatusChangeEvents = Effect.fn("TorrentSync.buildStatusChangeEvents")(function* (
        rows: readonly TorrentSyncUpdate[],
        existingDownloadsMap: ReadonlyMap<string | undefined, typeof downloads.$inferSelect>,
      ) {
        const maybeEvents: Array<DownloadEventRecordInput | null> = yield* Effect.forEach(
          rows,
          (row) =>
            Effect.gen(function* () {
              const existing = existingDownloadsMap.get(row.hash);
              if (!existing || existing.status === row.nextStatus) {
                return null;
              }

              const sourceMetadata = yield* decodeDownloadSourceMetadata(existing.sourceMetadata);
              const eventMetadata = yield* buildDownloadImportEventMetadata({
                coveredUnitsJson: existing.coveredUnits,
                ...(sourceMetadata ? { sourceMetadata } : {}),
              });

              return {
                mediaId: existing.mediaId,
                downloadId: existing.id,
                eventType: "download.status_changed",
                fromStatus: existing.status,
                metadata: eventMetadata,
                message: `${existing.torrentName} moved to ${row.nextStatus}`,
                toStatus: row.nextStatus,
              } satisfies DownloadEventRecordInput;
            }),
        );

        return maybeEvents.filter((event): event is DownloadEventRecordInput => event !== null);
      });

      const syncDownloadsWithQBitEffect = Effect.fn("TorrentSync.syncDownloadsWithQBit")(
        function* () {
          return yield* Effect.gen(function* () {
            const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
            const torrentsResult = yield* torrentClientService
              .listTorrentsIfEnabled()
              .pipe(Effect.result);

            if (torrentsResult._tag === "Failure") {
              yield* Effect.logWarning("Torrent client unreachable, skipping download sync").pipe(
                Effect.annotateLogs({ error: globalThis.String(torrentsResult.failure) }),
              );
              return;
            }

            if (torrentsResult.success._tag === "Disabled") {
              return;
            }

            const torrents = torrentsResult.success.torrents;

            if (torrents.length === 0) {
              return;
            }

            const infoHashes = torrents.map((t) => t.hash.toLowerCase());
            const allExistingDownloads = yield* syncRepo.listDownloadsByInfoHashes(infoHashes);

            const existingDownloadsMap = new Map(
              allExistingDownloads.map((d) => [d.infoHash?.toLowerCase(), d]),
            );

            const syncNow = yield* currentNowIso();

            // Sweep reconciliation claims orphaned by a hard crash: the claim
            // timestamp lets the sync pass detect stale claims, while claims
            // held by this process are never stale, no matter how long their
            // import runs (slow storage can exceed any fixed threshold).
            for (const existing of allExistingDownloads) {
              if (!existing.reconcileClaim) {
                continue;
              }
              if (!isStaleReconcileClaim(existing.reconcileClaimedAt, syncNow)) {
                continue;
              }

              if (yield* reconciliationService.hasLiveReconciliationClaim(existing.id)) {
                continue;
              }

              yield* syncRepo.releaseDownloadReconciliationClaim({
                downloadId: existing.id,
                claimToken: existing.reconcileClaim,
              });
              yield* Effect.logWarning("Released stale reconciliation claim").pipe(
                Effect.annotateLogs({
                  downloadId: existing.id,
                  claimToken: existing.reconcileClaim,
                }),
              );
            }

            const updateRows = torrents.map((torrent): TorrentSyncUpdate => {
              const status = torrent.state;
              const hash = torrent.hash.toLowerCase();
              const existing = existingDownloadsMap.get(hash);
              // A finalized import stays imported regardless of later client
              // state — `reconciledAt` carries only finalized timestamps now,
              // so no token branch is needed to keep presentation actionable.
              const preservedImported = existing?.reconciledAt != null;
              const nextStatus = preservedImported ? "imported" : status;
              const nextExternalState = preservedImported
                ? (existing?.externalState ?? "imported")
                : torrent.rawState;
              const nextDownloadDate = preservedImported
                ? (existing?.downloadDate ?? syncNow)
                : status === "completed"
                  ? syncNow
                  : null;

              return {
                contentPath: torrent.contentPath,
                downloadedBytes: torrent.downloadedBytes,
                downloadDate: nextDownloadDate,
                errorMessage:
                  !preservedImported && status === "error"
                    ? `Torrent state: ${torrent.rawState}`
                    : null,
                etaSeconds: torrent.eta,
                externalState: nextExternalState,
                hash,
                lastErrorAt: preservedImported || status !== "error" ? null : syncNow,
                lastSyncedAt: syncNow,
                nextStatus,
                progress: Math.round(torrent.progress * 100),
                savePath: torrent.savePath,
                status,
                torrentName: torrent.name,
                totalBytes: torrent.size,
                speedBytes: torrent.speed,
              };
            });

            const statusEvents = yield* buildStatusChangeEvents(updateRows, existingDownloadsMap);
            // Key events by the torrent hash of their download row so each
            // chunked update transaction carries its own events.
            const hashByDownloadId = new Map<number, string>();
            for (const existing of allExistingDownloads) {
              if (existing.infoHash) {
                hashByDownloadId.set(existing.id, existing.infoHash.toLowerCase());
              }
            }
            const eventsByTorrentHash = new Map<string, DownloadEventRecordInput>();
            const orphanEvents: DownloadEventRecordInput[] = [];
            for (const event of statusEvents) {
              const hash =
                event.downloadId === undefined ? undefined : hashByDownloadId.get(event.downloadId);
              if (hash !== undefined) {
                eventsByTorrentHash.set(hash, event);
              } else {
                orphanEvents.push(event);
              }
            }
            if (orphanEvents.length > 0) {
              yield* Effect.logWarning(
                "Dropping status change events for downloads without infoHash",
              ).pipe(Effect.annotateLogs({ orphanCount: orphanEvents.length }));
              // Orphans have no torrent hash to pin to a chunk — persist them directly.
              for (const orphan of orphanEvents) {
                yield* syncRepo.insertDownloadEvent(orphan, syncNow).pipe(
                  Effect.catch((cause) =>
                    Effect.logWarning("Failed to persist orphan status event").pipe(
                      Effect.annotateLogs({
                        downloadId: orphan.downloadId,
                        ...errorLogAnnotations(cause),
                      }),
                    ),
                  ),
                );
              }
            }

            yield* updateDownloadsFromTorrentRows(updateRows, eventsByTorrentHash, syncNow);

            const staleQueuedSwept = yield* syncRepo.failStaleQueuedDownloads({
              now: syncNow,
              staleBefore: new Date(Date.parse(syncNow) - STALE_QUEUED_THRESHOLD_MS).toISOString(),
            });
            if (staleQueuedSwept > 0) {
              yield* Effect.logWarning("Marked phantom queued downloads as failed").pipe(
                Effect.annotateLogs({ sweptCount: staleQueuedSwept }),
              );
            }

            const batchRefinementRows = updateRows.flatMap(
              (
                updateRow,
              ): {
                readonly downloadId: number;
                readonly existingCoveredEpisodes: string | null;
                readonly infoHash: string;
                readonly mediaId: number;
                readonly rawSourceMetadata: string | null;
                readonly torrentName: string;
              }[] => {
                const existing = existingDownloadsMap.get(updateRow.hash);
                const preservedImported = existing?.reconciledAt != null;

                if (!existing || !existing.isBatch || preservedImported) {
                  return [];
                }

                return [
                  {
                    downloadId: existing.id,
                    existingCoveredEpisodes: existing.coveredUnits,
                    infoHash: updateRow.hash,
                    mediaId: existing.mediaId,
                    rawSourceMetadata: existing.sourceMetadata,
                    torrentName: updateRow.torrentName,
                  },
                ];
              },
            );

            yield* Effect.forEach(
              batchRefinementRows,
              (row) =>
                Effect.gen(function* () {
                  const sourceMetadata = yield* decodeDownloadSourceMetadata(row.rawSourceMetadata);
                  yield* refineBatchCoverageFromTorrentFiles({
                    mediaId: row.mediaId,
                    downloadId: row.downloadId,
                    existingCoveredEpisodes: row.existingCoveredEpisodes,
                    infoHash: row.infoHash,
                    ...(sourceMetadata ? { sourceMetadata } : {}),
                    torrentName: row.torrentName,
                  });
                }),
              { concurrency: TORRENT_CONTENTS_REFINE_CONCURRENCY, discard: true },
            );

            // One poisoned download must not abort the whole sync pass: each
            // reconcile is isolated, failures are logged and counted per
            // error tag (Q6) so the poison class stays visible.
            const failureTags = new Map<string, number>();
            let failedReconciliations = 0;
            for (const updateRow of updateRows) {
              if (
                updateRow.status !== "completed" ||
                !shouldReconcileCompletedDownloads(runtimeConfig)
              ) {
                continue;
              }

              const cachedContents = torrentContentsCache.get(updateRow.hash);
              const reconcileResult = yield* Effect.result(
                reconciliationService.reconcileCompletedTorrentEffect(
                  updateRow.hash,
                  updateRow.contentPath ?? updateRow.savePath ?? undefined,
                  cachedContents,
                ),
              );

              if (reconcileResult._tag === "Failure") {
                failedReconciliations += 1;
                const tag = failureTagOf(reconcileResult.failure);
                failureTags.set(tag, (failureTags.get(tag) ?? 0) + 1);
                yield* Effect.logWarning(
                  "Failed to reconcile completed download; continuing with remaining torrents",
                ).pipe(
                  Effect.annotateLogs({
                    downloadHash: updateRow.hash,
                    failureTag: tag,
                    ...errorLogAnnotations(reconcileResult.failure),
                  }),
                );
              }
            }

            if (failedReconciliations > 0) {
              yield* Effect.logWarning("Download sync finished with reconciliation failures").pipe(
                Effect.annotateLogs({
                  failedReconciliations,
                  failureTags: [...failureTags].map(([tag, count]) => `${tag}:${count}`),
                }),
              );
            }
          }).pipe(Effect.mapError((error) => mapSyncError(error)));
        },
      );

      const syncDownloads = Effect.fn("TorrentSync.syncDownloads")(function* () {
        return yield* Effect.gen(function* () {
          const [duration, exit] = yield* syncDownloadsWithQBitEffect().pipe(
            Effect.exit,
            Effect.timed,
          );

          if (exit._tag === "Failure") {
            return yield* Effect.failCause(exit.cause);
          }

          yield* Effect.logDebug("download state sync completed").pipe(
            Effect.annotateLogs({
              component: "downloads",
              durationMs: Duration.toMillis(duration),
              syncTrigger: "downloads.manual_sync",
            }),
          );
          yield* progress.publishDownloadProgressNow();
          yield* eventBus.publishInfo("Download sync finished");
          return undefined;
        }).pipe(
          syncSemaphore.withPermits(1),
          Effect.mapError((e) => mapSyncError(e)),
        );
      });

      const startDownloadSync = Effect.fn("DownloadTorrentSyncService.startDownloadSync")(
        function* () {
          return yield* taskLauncher.launch({
            failureMessage: "Manual download sync failed",
            operation: () => syncDownloads(),
            queuedMessage: "Queued manual download sync",
            runningMessage: "Running manual download sync",
            successMessage: () => "Manual download sync finished",
            taskKey: "downloads_sync_manual",
          });
        },
      );

      return {
        startDownloadSync,
        syncDownloads,
        syncDownloadsWithQBitEffect,
      } satisfies DownloadTorrentSyncServiceShape;
    }),
  );
}

export const DownloadTorrentSyncServiceLive = DownloadTorrentSyncService.layer;
