import { Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import { DomainInputError, InfrastructureError, StoredDataError } from "@/features/errors.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { OperationsConflictError, OperationsNotFoundError } from "@/features/operations/errors.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { decodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import { parseCoveredUnitsEffect } from "@/features/operations/download/download-coverage.ts";
import { TorrentClientService } from "@/features/operations/torrent/torrent-client-service.ts";
import { TorrentClientUnavailableError } from "@/features/operations/torrent/torrent-domain.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";

type TorrentActionError =
  | DatabaseError
  | DomainInputError
  | ExternalCallError
  | InfrastructureError
  | OperationsNotFoundError
  | OperationsConflictError
  | TorrentClientUnavailableError
  | RuntimeConfigSnapshotError
  | StoredDataError;

export interface DownloadTorrentActionServiceShape {
  readonly applyDownloadActionEffect: (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles?: boolean,
  ) => Effect.Effect<void, TorrentActionError>;
  readonly retryDownloadById: (id: number) => Effect.Effect<void, TorrentActionError>;
}

export class DownloadTorrentActionService extends Effect.Service<DownloadTorrentActionService>()(
  "@bakarr/api/DownloadTorrentActionService",
  {
    // Progress + torrent client provided by ops feature layer.
    dependencies: [DownloadRepository.Default, EventBus.Default],
    effect: Effect.gen(function* () {
      const actionRepo = yield* DownloadRepository;
      const eventBus = yield* EventBus;
      const progress = yield* OperationsProgress;
      const torrentClientService = yield* TorrentClientService;

      const applyDownloadActionEffect = Effect.fn("TorrentAction.applyDownloadAction")(function* (
        id: number,
        action: "pause" | "resume" | "delete",
        deleteFiles = false,
      ) {
        const row = yield* actionRepo.loadDownloadById(id);

        if (!row) {
          return yield* new OperationsNotFoundError({
            message: "Download not found",
          });
        }

        if (row.infoHash) {
          if (action === "pause") {
            const pauseResult = yield* torrentClientService.pauseTorrentIfEnabled(row.infoHash);
            if (pauseResult._tag === "Disabled") {
              yield* Effect.logDebug("Skipped pause because the torrent client is disabled").pipe(
                Effect.annotateLogs({ downloadId: id }),
              );
              return undefined;
            }
          } else if (action === "resume") {
            const resumeResult = yield* torrentClientService.resumeTorrentIfEnabled(row.infoHash);
            if (resumeResult._tag === "Disabled") {
              yield* Effect.logDebug("Skipped resume because the torrent client is disabled").pipe(
                Effect.annotateLogs({ downloadId: id }),
              );
              return undefined;
            }
          } else {
            yield* torrentClientService
              .deleteTorrentIfEnabled(row.infoHash, deleteFiles)
              .pipe(Effect.asVoid);
          }
        }

        const coveredUnits = yield* parseCoveredUnitsEffect(row.coveredUnits);

        if (action === "delete") {
          const sourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);
          const deleteNow = yield* currentNowIso();
          // Event + row removal commit together: a deleted download never
          // disappears without its deletion event.
          yield* actionRepo.deleteDownloadWithEventTx({
            createdAt: deleteNow,
            downloadId: row.id,
            event: {
              mediaId: row.mediaId,
              downloadId: row.id,
              eventType: "download.deleted",
              fromStatus: row.status,
              metadataJson: {
                covered_units: coveredUnits,
                ...(sourceMetadata ? { source_metadata: sourceMetadata } : {}),
              },
              message: `Deleted ${row.torrentName}`,
              toStatus: "deleted",
            },
          });
        } else {
          const nextStatus = action === "pause" ? "paused" : row.status;
          const actionSourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);
          const actionNow = yield* currentNowIso();
          // Status + event commit together: a synced row never observes a
          // status without its event (same guarantee as delete/finalize).
          yield* actionRepo.updateDownloadStatusWithEventTx({
            createdAt: actionNow,
            downloadId: row.id,
            eventType: `download.${action}d`,
            eventMessage: `${action === "pause" ? "Paused" : "Resumed"} ${row.torrentName}`,
            eventMetadataJson: {
              covered_units: coveredUnits,
              ...(actionSourceMetadata ? { source_metadata: actionSourceMetadata } : {}),
            },
            externalState: action,
            fromStatus: row.status,
            mediaId: row.mediaId,
            status: nextStatus,
            toStatus: nextStatus,
          });
        }

        if (action === "pause") {
          yield* eventBus.publishInfo(`Paused download ${id}`);
        } else if (action === "resume") {
          yield* eventBus.publishInfo(`Resumed download ${id}`);
        } else {
          yield* eventBus.publishInfo(`Removed download ${id}`);
        }

        return undefined;
      });

      const retryDownloadById = Effect.fn("TorrentAction.retryDownloadById")(function* (
        id: number,
      ) {
        const row = yield* actionRepo.loadDownloadById(id);

        if (!row) {
          return yield* new OperationsNotFoundError({
            message: "Download not found",
          });
        }

        if (!row.magnet) {
          return yield* new OperationsConflictError({
            message: "Download cannot be retried without a magnet link",
          });
        }

        const coveredUnits = yield* parseCoveredUnitsEffect(row.coveredUnits);
        const addResult = yield* torrentClientService.addTorrentUrlIfEnabled(row.magnet);
        const startedInClient = addResult._tag === "Added";

        const retryNow = yield* currentNowIso();
        yield* actionRepo.updateDownloadRetryRow({
          id,
          externalState: startedInClient ? "downloading" : "queued",
          retryNow,
          status: startedInClient ? "downloading" : "queued",
        });

        const retrySourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);
        yield* actionRepo.insertDownloadEvent(
          {
            mediaId: row.mediaId,
            downloadId: row.id,
            eventType: "download.retried",
            fromStatus: row.status,
            metadataJson: {
              covered_units: coveredUnits,
              ...(retrySourceMetadata ? { source_metadata: retrySourceMetadata } : {}),
            },
            message: `Retried ${row.torrentName}`,
            toStatus: startedInClient ? "downloading" : "queued",
          },
          retryNow,
        );
        yield* progress.publishDownloadProgressNow();
        yield* eventBus.publishInfo(`Retried download ${id}`);
        return undefined;
      });

      return {
        applyDownloadActionEffect,
        retryDownloadById,
      } satisfies DownloadTorrentActionServiceShape;
    }),
  },
) {}

export const DownloadTorrentActionServiceLive = DownloadTorrentActionService.Default;
