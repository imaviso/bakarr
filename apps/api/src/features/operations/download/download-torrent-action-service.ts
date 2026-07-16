import { Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { DomainInputError, InfrastructureError, StoredDataError } from "@/features/errors.ts";
import { DownloadProgressService } from "@/features/operations/download/download-progress-service.ts";
import { OperationsConflictError, OperationsNotFoundError } from "@/features/operations/errors.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";
import { decodeDownloadSourceMetadata } from "@/features/operations/repository/download-row-codec.ts";
import { parseCoveredEpisodesEffect } from "@/features/operations/download/download-coverage.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { QBitTorrentClientError } from "@/features/operations/qbittorrent/qbittorrent-models.ts";
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
  | QBitTorrentClientError
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
      const progressSupport = yield* DownloadProgressService;
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
            yield* torrentClientService.pauseTorrentIfEnabled(row.infoHash).pipe(Effect.asVoid);
          } else if (action === "resume") {
            yield* torrentClientService.resumeTorrentIfEnabled(row.infoHash).pipe(Effect.asVoid);
          } else {
            yield* torrentClientService
              .deleteTorrentIfEnabled(row.infoHash, deleteFiles)
              .pipe(Effect.asVoid);
          }
        }

        const coveredUnits = yield* parseCoveredEpisodesEffect(row.coveredUnits);

        if (action === "delete") {
          const sourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);
          const deleteNow = yield* currentNowIso();
          yield* actionRepo.insertDownloadEvent(
            {
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
            deleteNow,
          );
          yield* actionRepo.deleteDownloadRow(id);
        } else {
          const nextStatus = action === "pause" ? "paused" : "downloading";
          yield* actionRepo.updateDownloadStatusRow({
            id,
            externalState: action,
            status: nextStatus,
          });

          const actionSourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);
          const actionNow = yield* currentNowIso();
          yield* actionRepo.insertDownloadEvent(
            {
              mediaId: row.mediaId,
              downloadId: row.id,
              eventType: `download.${action}d`,
              fromStatus: row.status,
              metadataJson: {
                covered_units: coveredUnits,
                ...(actionSourceMetadata ? { source_metadata: actionSourceMetadata } : {}),
              },
              message: `${action === "pause" ? "Paused" : "Resumed"} ${row.torrentName}`,
              toStatus: nextStatus,
            },
            actionNow,
          );
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

        const coveredUnits = yield* parseCoveredEpisodesEffect(row.coveredUnits);
        const qbitResult = yield* torrentClientService.addTorrentUrlIfEnabled(row.magnet);
        const startedInQBit = qbitResult._tag === "Added";

        const retryNow = yield* currentNowIso();
        yield* actionRepo.updateDownloadRetryRow({
          id,
          externalState: startedInQBit ? "downloading" : "queued",
          retryNow,
          status: startedInQBit ? "downloading" : "queued",
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
            toStatus: startedInQBit ? "downloading" : "queued",
          },
          retryNow,
        );
        yield* progressSupport.publishDownloadProgress();
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
