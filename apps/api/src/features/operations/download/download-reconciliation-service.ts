import { Cause, Effect, Option } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { RandomService } from "@/infra/random.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";
import { DownloadProgressSupport } from "@/features/operations/download/download-progress-support.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import {
  loadDownloadReconciliationContext,
  reconcileBatchDownloadEffect,
  reconcileSingleDownloadEffect,
  type ReconcileByIdError,
  type ReconcileCompletedError,
} from "@/features/operations/download/download-reconciliation.ts";
import {
  shouldDeleteImportedData,
  shouldRemoveTorrentOnImport,
} from "@/features/operations/download/download-reconciliation-policy.ts";
import { OperationsConflictError, OperationsNotFoundError } from "@/features/operations/errors.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";

export interface DownloadReconciliationServiceShape {
  readonly maybeCleanupImportedTorrent: (
    config: Config | null | undefined,
    infoHash: string | null,
  ) => Effect.Effect<void>;
  readonly reconcileCompletedTorrentEffect: (
    infoHash: string,
    contentPath: string | undefined,
  ) => Effect.Effect<void, ReconcileCompletedError>;
  readonly reconcileDownloadByIdEffect: (id: number) => Effect.Effect<void, ReconcileByIdError>;
}

export class DownloadReconciliationService extends Effect.Service<DownloadReconciliationService>()(
  "@bakarr/api/DownloadReconciliationService",
  {
    // Platform/FS/torrent/progress provided by ops feature layer; list pure leaves only.
    dependencies: [
      DownloadRepository.Default,
      EventBus.Default,
      MediaReadRepository.Default,
      MediaUnitRepository.Default,
      RandomService.Default,
    ],
    effect: Effect.gen(function* () {
      const repo = yield* DownloadRepository;
      const eventBus = yield* EventBus;
      const fs = yield* FileSystem;
      const mediaProbe = yield* MediaProbe;
      const mediaReadRepository = yield* MediaReadRepository;
      const mediaUnitRepository = yield* MediaUnitRepository;
      const torrentClientService = yield* TorrentClientService;
      const progressSupport = yield* DownloadProgressSupport;
      const random = yield* RandomService;
      const runtimeConfigSnapshotService = yield* RuntimeConfigSnapshotService;
      const nowIso = currentNowIso;
      const randomUuid = () => random.randomUuid;
      const getRuntimeConfig = runtimeConfigSnapshotService.getRuntimeConfig;

      const maybeCleanupImportedTorrent = Effect.fn(
        "DownloadReconcile.maybeCleanupImportedTorrent",
      )(function* (config: Config | null | undefined, infoHash: string | null) {
        if (!infoHash || !shouldRemoveTorrentOnImport(config)) {
          return;
        }

        yield* torrentClientService
          .deleteTorrentIfEnabled(infoHash, shouldDeleteImportedData(config))
          .pipe(
            Effect.flatMap((result) =>
              result._tag === "Disabled"
                ? Effect.logDebug("Skipped qBittorrent cleanup because it is disabled")
                : Effect.void,
            ),
            Effect.catchAllCause((cause) =>
              Effect.logWarning("Failed to delete imported torrent from qBittorrent").pipe(
                Effect.annotateLogs({
                  infoHash,
                  cause: Cause.pretty(cause),
                }),
              ),
            ),
          );
      });

      const reconcileCompletedTorrentEffect = Effect.fn(
        "DownloadReconcile.reconcileCompletedTorrent",
      )(function* (infoHash: string, contentPath: string | undefined) {
        if (!contentPath) {
          return;
        }

        const row = yield* repo.loadDownloadByInfoHash(infoHash);
        if (!row || row.reconciledAt) {
          return;
        }

        const context = yield* loadDownloadReconciliationContext({
          repo,
          mediaUnitRepository,
          eventBus,
          fs,
          mediaProbe,
          maybeCleanupImportedTorrent,
          nowIso,
          randomUuid,
          row,
          contentPath,
          getRuntimeConfig,
          mediaReadRepository,
        });

        if (Option.isNone(context)) {
          return;
        }

        if (context.value.row.isBatch) {
          const handledBatch = yield* reconcileBatchDownloadEffect(context.value);
          if (handledBatch) {
            return;
          }
        }

        yield* reconcileSingleDownloadEffect(context.value);
      });

      const reconcileDownloadByIdEffect = Effect.fn(
        "DownloadReconcileService.reconcileDownloadById",
      )(function* (id: number) {
        const row = yield* repo.loadDownloadById(id);

        if (!row) {
          return yield* new OperationsNotFoundError({
            message: "Download not found",
          });
        }

        const contentPath = row.contentPath ?? row.savePath;

        if (!contentPath || !row.infoHash) {
          return yield* new OperationsConflictError({
            message: "Download has no reconciliable content path",
          });
        }

        yield* reconcileCompletedTorrentEffect(row.infoHash, contentPath);
        yield* progressSupport.publishDownloadProgress();
        yield* eventBus.publishInfo(`Reconciled download ${id}`);
      });

      return {
        maybeCleanupImportedTorrent,
        reconcileCompletedTorrentEffect,
        reconcileDownloadByIdEffect,
      } satisfies DownloadReconciliationServiceShape;
    }),
  },
) {}

export const DownloadReconciliationServiceLive = DownloadReconciliationService.Default;
