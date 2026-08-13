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
import { DownloadReconciliationService } from "@/features/operations/download/download-reconciliation-service.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { DatabaseError } from "@/db/database.ts";
import { InfrastructureError } from "@/features/errors.ts";

function shouldReconcileCompletedDownloads(config: Config | null) {
  return config?.downloads.reconcile_completed_downloads ?? true;
}

const TORRENT_SYNC_UPDATE_CHUNK_SIZE = 50;
const TORRENT_CONTENTS_REFINE_CONCURRENCY = 4;

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
      )(function* (rows: readonly TorrentSyncUpdate[]) {
        if (rows.length === 0) {
          return;
        }

        for (let index = 0; index < rows.length; index += TORRENT_SYNC_UPDATE_CHUNK_SIZE) {
          const chunk = rows.slice(index, index + TORRENT_SYNC_UPDATE_CHUNK_SIZE);
          yield* syncRepo.bulkUpdateTorrentSyncRows(chunk);
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
            const updateRows = torrents.map((torrent): TorrentSyncUpdate => {
              const status = mapQBitState(torrent.state);
              const hash = torrent.hash.toLowerCase();
              const existing = existingDownloadsMap.get(hash);
              const preservedImported = Boolean(existing?.reconciledAt);
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

            yield* updateDownloadsFromTorrentRows(updateRows);

            const statusEvents = yield* buildStatusChangeEvents(updateRows, existingDownloadsMap);
            yield* syncRepo.insertDownloadEvents(statusEvents, syncNow);

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
                const preservedImported = Boolean(existing?.reconciledAt);

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

            for (const updateRow of updateRows) {
              if (
                updateRow.status === "completed" &&
                shouldReconcileCompletedDownloads(runtimeConfig)
              ) {
                yield* reconciliationService.reconcileCompletedTorrentEffect(
                  updateRow.hash,
                  updateRow.contentPath ?? updateRow.savePath ?? undefined,
                );
              }
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
