import { Context, Effect, Layer } from "effect";

import { DatabaseError } from "@/db/database.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsInfrastructureError,
  OperationsStoredDataError,
} from "@/features/operations/errors.ts";
import { DownloadActionRepository } from "@/features/operations/repository/download-action-repository.ts";
import { decodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import { parseCoveredEpisodesEffect } from "@/features/operations/download/download-coverage.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";

export interface DownloadTorrentActionSupportInput {
  readonly actionRepo: typeof DownloadActionRepository.Service;
  readonly torrentClientService: typeof TorrentClientService.Service;
  readonly nowIso: () => Effect.Effect<string>;
  readonly getRuntimeConfig: () => Effect.Effect<
    import("@packages/shared/index.ts").Config,
    RuntimeConfigSnapshotError
  >;
}

export interface DownloadTorrentActionSupportShape {
  readonly applyDownloadActionEffect: (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles?: boolean,
  ) => Effect.Effect<
    void,
    | DatabaseError
    | DownloadNotFoundError
    | OperationsStoredDataError
    | OperationsInfrastructureError
  >;
  readonly retryDownloadById: (
    id: number,
  ) => Effect.Effect<
    void,
    | DatabaseError
    | DownloadNotFoundError
    | DownloadConflictError
    | OperationsStoredDataError
    | OperationsInfrastructureError
  >;
}

export class DownloadTorrentActionService extends Context.Tag(
  "@bakarr/api/DownloadTorrentActionService",
)<DownloadTorrentActionService, DownloadTorrentActionSupportShape>() {}

export const DownloadTorrentActionServiceLive = Layer.effect(
  DownloadTorrentActionService,
  Effect.gen(function* () {
    const actionRepo = yield* DownloadActionRepository;
    const torrentClientService = yield* TorrentClientService;
    const clock = yield* ClockService;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

    return DownloadTorrentActionService.of(
      makeDownloadTorrentActionSupport({
        actionRepo,
        getRuntimeConfig: runtimeConfigSnapshot.getRuntimeConfig,
        nowIso: () => nowIsoFromClock(clock),
        torrentClientService,
      }),
    );
  }),
);

export function makeDownloadTorrentActionSupport(input: DownloadTorrentActionSupportInput) {
  const { actionRepo, torrentClientService, nowIso } = input;

  const mapQBitError = (message: string) => (cause: unknown) =>
    new OperationsInfrastructureError({
      message,
      cause,
    });

  const applyDownloadActionEffect = Effect.fn("OperationsService.applyDownloadAction")(function* (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles = false,
  ) {
    const row = yield* actionRepo.loadDownloadRow(id);

    if (!row) {
      return yield* new DownloadNotFoundError({
        message: "Download not found",
      });
    }

    if (row.infoHash) {
      if (action === "pause") {
        yield* torrentClientService
          .pauseTorrentIfEnabled(row.infoHash)
          .pipe(Effect.asVoid, Effect.mapError(mapQBitError("Failed to pause download")));
      } else if (action === "resume") {
        yield* torrentClientService
          .resumeTorrentIfEnabled(row.infoHash)
          .pipe(Effect.asVoid, Effect.mapError(mapQBitError("Failed to resume download")));
      } else {
        yield* torrentClientService
          .deleteTorrentIfEnabled(row.infoHash, deleteFiles)
          .pipe(Effect.asVoid, Effect.mapError(mapQBitError("Failed to remove download")));
      }
    }

    const coveredUnits = yield* parseCoveredEpisodesEffect(row.coveredUnits);

    if (action === "delete") {
      const sourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);
      const deleteNow = yield* nowIso();
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
      const actionNow = yield* nowIso();
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
    return undefined;
  });

  const retryDownloadById = Effect.fn("OperationsService.retryDownloadById")(function* (
    id: number,
  ) {
    const row = yield* actionRepo.loadDownloadRow(id);

    if (!row) {
      return yield* new DownloadNotFoundError({
        message: "Download not found",
      });
    }

    if (!row.magnet) {
      return yield* new DownloadConflictError({
        message: "Download cannot be retried without a magnet link",
      });
    }

    const coveredUnits = yield* parseCoveredEpisodesEffect(row.coveredUnits);
    const qbitResult = yield* torrentClientService
      .addTorrentUrlIfEnabled(row.magnet)
      .pipe(Effect.either);

    if (qbitResult._tag === "Left") {
      return yield* mapQBitError("Failed to retry download")(qbitResult.left);
    }

    const startedInQBit = qbitResult.right._tag === "Added";

    const retryNow = yield* nowIso();
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
    return undefined;
  });

  return {
    applyDownloadActionEffect,
    retryDownloadById,
  };
}
