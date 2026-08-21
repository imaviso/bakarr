// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Effect, Duration, Option } from "effect";

import type {
  AsyncOperationAccepted,
  Config,
  DownloadSourceMetadata,
} from "@packages/shared/index.ts";
import type { downloads } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import {
  inferCoveredUnitsFromTorrentContents,
  parseCoveredUnitsEffect,
  toCoveredUnitsJson,
} from "@/features/operations/download/download-coverage.ts";
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
import { mapQBitState } from "@/features/operations/qbittorrent/qbittorrent.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { currentTimeNanos, nowIso as currentNowIso } from "@/infra/time.ts";
import {
  isClaimToken,
  isStaleClaimToken,
} from "@/features/operations/download/download-claim-token.ts";
import { DownloadReconciliationService } from "@/features/operations/download/download-reconciliation-service.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { DatabaseError } from "@/db/database.ts";
import { InfrastructureError } from "@/features/errors.ts";

function shouldReconcileCompletedDownloads(config: Config | null) {
  return config?.downloads.reconcile_completed_downloads ?? true;
}

const TORRENT_SYNC_UPDATE_CHUNK_SIZE = 50;
const TORRENT_CONTENTS_REFINE_CONCURRENCY = 4;
/** A queued row absent from qBittorrent for this long is considered lost. */
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

export class DownloadTorrentSyncService extends Effect.Service<DownloadTorrentSyncService>()(
  "@bakarr/api/DownloadTorrentSyncService",
  {
    // Progress/torrent/config snapshot come from the lifecycle layer.
    dependencies: [
      DownloadReconciliationService.Default,
      DownloadRepository.Default,
      EventBus.Default,
      MediaRepository.Default,
      OperationsTaskLauncherService.Default,
    ],
    effect: Effect.gen(function* () {
      const syncRepo = yield* DownloadRepository;
      const mediaRepository = yield* MediaRepository;
      const torrentClientService = yield* TorrentClientService;
      const reconciliationService = yield* DownloadReconciliationService;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
      const eventBus = yield* EventBus;
      const progress = yield* OperationsProgress;
      const taskLauncher = yield* OperationsTaskLauncherService;
      const syncSemaphore = yield* Effect.makeSemaphore(1);

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
          .pipe(Effect.either);

        if (contentsResult._tag === "Left") {
          yield* Effect.logDebug("Failed to inspect qBittorrent file list").pipe(
            Effect.annotateLogs({
              downloadId: refineInput.downloadId,
              error: String(contentsResult.left),
              infoHash: refineInput.infoHash,
            }),
          );
          return;
        }

        if (contentsResult.right._tag === "Disabled") {
          return;
        }

        const mediaRowOption = yield* mediaRepository
          .getMediaRow(refineInput.mediaId)
          .pipe(Effect.option);
        const inferredEpisodes = inferCoveredUnitsFromTorrentContents({
          files: contentsResult.right.files,
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
        yield* syncRepo.insertDownloadEvent(
          {
            mediaId: refineInput.mediaId,
            downloadId: refineInput.downloadId,
            eventType: "download.coverage_refined",
            metadataJson: {
              covered_units: inferredEpisodes,
              ...(refineInput.sourceMetadata
                ? { source_metadata: refineInput.sourceMetadata }
                : {}),
            },
            message: `Refined batch mediaUnits from qBittorrent file list: ${inferredEpisodes.join(", ")}`,
            metadata: encodedInferredEpisodes,
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

              const coveredUnits = yield* parseCoveredUnitsEffect(existing.coveredUnits);
              const sourceMetadata = yield* decodeDownloadSourceMetadata(existing.sourceMetadata);

              return {
                mediaId: existing.mediaId,
                downloadId: existing.id,
                eventType: "download.status_changed",
                fromStatus: existing.status,
                metadataJson: {
                  covered_units: coveredUnits,
                  ...(sourceMetadata ? { source_metadata: sourceMetadata } : {}),
                },
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
              .pipe(Effect.either);

            if (torrentsResult._tag === "Left") {
              yield* Effect.logWarning("qBittorrent unreachable, skipping download sync").pipe(
                Effect.annotateLogs({ error: String(torrentsResult.left) }),
              );
              return;
            }

            if (torrentsResult.right._tag === "Disabled") {
              return;
            }

            const torrents = torrentsResult.right.torrents;

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
            // token embeds its timestamp, so anything past the threshold has
            // no live fiber and must be released for auto-reconcile to retry.
            // Claims held by this process are never stale, no matter how long
            // their import runs (slow storage can exceed any fixed threshold).
            for (const existing of allExistingDownloads) {
              if (!isStaleClaimToken(existing.reconciledAt, syncNow)) {
                continue;
              }

              if (yield* reconciliationService.hasLiveReconciliationClaim(existing.id)) {
                continue;
              }

              yield* syncRepo.releaseDownloadReconciliationClaim({
                downloadId: existing.id,
                claimToken: existing.reconciledAt ?? "",
              });
              yield* Effect.logWarning("Released stale reconciliation claim").pipe(
                Effect.annotateLogs({
                  downloadId: existing.id,
                  claimToken: existing.reconciledAt ?? "",
                }),
              );
            }

            const updateRows = torrents.map((torrent): TorrentSyncUpdate => {
              const status = mapQBitState(torrent.state);
              const hash = torrent.hash.toLowerCase();
              const existing = existingDownloadsMap.get(hash);
              // A leftover claim token means the import never finished — treat
              // the row as not imported so presentation stays actionable.
              const preservedImported =
                Boolean(existing?.reconciledAt) && !isClaimToken(existing?.reconciledAt);
              const nextStatus = preservedImported ? "imported" : status;
              const nextExternalState = preservedImported
                ? (existing?.externalState ?? "imported")
                : torrent.state;
              const nextDownloadDate = preservedImported
                ? (existing?.downloadDate ?? syncNow)
                : status === "completed"
                  ? syncNow
                  : null;

              return {
                contentPath: torrent.content_path ?? null,
                downloadedBytes: torrent.downloaded,
                downloadDate: nextDownloadDate,
                errorMessage:
                  !preservedImported && status === "error"
                    ? `qBittorrent state: ${torrent.state}`
                    : null,
                etaSeconds: torrent.eta,
                externalState: nextExternalState,
                hash,
                lastErrorAt: preservedImported || status !== "error" ? null : syncNow,
                lastSyncedAt: syncNow,
                nextStatus,
                progress: Math.round(torrent.progress * 100),
                savePath: torrent.save_path ?? null,
                status,
                torrentName: torrent.name,
                totalBytes: torrent.size,
                speedBytes: torrent.dlspeed,
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
                  Effect.catchAll((cause) =>
                    Effect.logWarning("Failed to persist orphan status event").pipe(
                      Effect.annotateLogs({
                        cause: String(cause),
                        downloadId: orphan.downloadId,
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
                const preservedImported =
                  Boolean(existing?.reconciledAt) && !isClaimToken(existing?.reconciledAt);

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
            // reconcile is isolated, failures are logged and counted.
            let failedReconciliations = 0;
            for (const updateRow of updateRows) {
              if (
                updateRow.status !== "completed" ||
                !shouldReconcileCompletedDownloads(runtimeConfig)
              ) {
                continue;
              }

              const reconcileResult = yield* Effect.either(
                reconciliationService.reconcileCompletedTorrentEffect(
                  updateRow.hash,
                  updateRow.contentPath ?? updateRow.savePath ?? undefined,
                ),
              );

              if (reconcileResult._tag === "Left") {
                failedReconciliations += 1;
                yield* Effect.logWarning(
                  "Failed to reconcile completed download; continuing with remaining torrents",
                ).pipe(
                  Effect.annotateLogs({
                    downloadHash: updateRow.hash,
                    error: String(reconcileResult.left),
                  }),
                );
              }
            }

            if (failedReconciliations > 0) {
              yield* Effect.logWarning("Download sync finished with reconciliation failures").pipe(
                Effect.annotateLogs({ failedReconciliations }),
              );
            }
          }).pipe(Effect.mapError((error) => mapSyncError(error)));
        },
      );

      const syncDownloads = Effect.fn("TorrentSync.syncDownloads")(function* () {
        return yield* Effect.gen(function* () {
          const [duration, exit] = yield* syncDownloadsWithQBitEffect().pipe(
            Effect.exit,
            Effect.timedWith(currentTimeNanos),
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
  },
) {}

export const DownloadTorrentSyncServiceLive = DownloadTorrentSyncService.Default;
