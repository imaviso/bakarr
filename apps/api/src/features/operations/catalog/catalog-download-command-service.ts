import { Context, Effect, Layer } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { DownloadReconciliationService } from "@/features/operations/download/download-reconciliation-service.ts";
import { DownloadTorrentActionService } from "@/features/operations/download/download-torrent-action-support.ts";
import { DownloadTorrentSyncService } from "@/features/operations/download/download-torrent-sync-support.ts";
import { DownloadProgressSupport } from "@/features/operations/download/download-progress-support.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import {
  isOperationsError,
  type OperationsError,
  OperationsInfrastructureError,
} from "@/features/operations/errors.ts";
import { durationMsSince } from "@/infra/logging.ts";
import { ClockService } from "@/infra/clock.ts";

export interface CatalogDownloadCommandServiceShape {
  readonly pauseDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly reconcileDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly removeDownload: (
    id: number,
    deleteFiles: boolean,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly resumeDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly retryDownload: (id: number) => Effect.Effect<void, OperationsError | DatabaseError>;
  readonly syncDownloads: () => Effect.Effect<void, DatabaseError | OperationsError>;
}

export class CatalogDownloadCommandService extends Context.Tag(
  "@bakarr/api/CatalogDownloadCommandService",
)<CatalogDownloadCommandService, CatalogDownloadCommandServiceShape>() {}

export const CatalogDownloadCommandServiceLive = Layer.effect(
  CatalogDownloadCommandService,
  Effect.gen(function* () {
    const clock = yield* ClockService;
    const torrentActions = yield* DownloadTorrentActionService;
    const torrentSync = yield* DownloadTorrentSyncService;
    const reconciliation = yield* DownloadReconciliationService;
    const progressSupport = yield* DownloadProgressSupport;
    const eventBus = yield* EventBus;

    const mapCommandError =
      (message: string) =>
      (cause: unknown): DatabaseError | OperationsError => {
        if (cause instanceof DatabaseError || isOperationsError(cause)) {
          return cause;
        }

        return new OperationsInfrastructureError({
          cause,
          message,
        });
      };

    const syncDownloadState = Effect.fn("operations.downloads.sync_state")(function* (
      trigger: string,
    ) {
      const startedAt = yield* clock.currentMonotonicMillis;

      yield* torrentSync.syncDownloadsWithQBitEffect();

      const finishedAt = yield* clock.currentMonotonicMillis;

      yield* Effect.logInfo("download state sync completed").pipe(
        Effect.annotateLogs({
          component: "downloads",
          durationMs: durationMsSince(startedAt, finishedAt),
          syncTrigger: trigger,
        }),
      );
    });

    const pauseDownload = Effect.fn("OperationsService.pauseDownload")(function* (id: number) {
      yield* torrentActions
        .applyDownloadActionEffect(id, "pause")
        .pipe(Effect.mapError(mapCommandError("Failed to pause download")));
      yield* eventBus.publishInfo(`Paused download ${id}`);
    });

    const resumeDownload = Effect.fn("OperationsService.resumeDownload")(function* (id: number) {
      yield* torrentActions
        .applyDownloadActionEffect(id, "resume")
        .pipe(Effect.mapError(mapCommandError("Failed to resume download")));
      yield* eventBus.publishInfo(`Resumed download ${id}`);
    });

    const removeDownload = Effect.fn("OperationsService.removeDownload")(function* (
      id: number,
      deleteFiles: boolean,
    ) {
      yield* torrentActions
        .applyDownloadActionEffect(id, "delete", deleteFiles)
        .pipe(Effect.mapError(mapCommandError("Failed to remove download")));
      yield* eventBus.publishInfo(`Removed download ${id}`);
    });

    const retryDownload = Effect.fn("OperationsService.retryDownload")(function* (id: number) {
      yield* torrentActions
        .retryDownloadById(id)
        .pipe(Effect.mapError(mapCommandError("Failed to retry download")));
      yield* progressSupport.publishDownloadProgress();
      yield* eventBus.publishInfo(`Retried download ${id}`);
    });

    const reconcileDownload = Effect.fn("OperationsService.reconcileDownload")(function* (
      id: number,
    ) {
      yield* reconciliation
        .reconcileDownloadByIdEffect(id)
        .pipe(Effect.mapError(mapCommandError("Failed to reconcile download")));
      yield* progressSupport.publishDownloadProgress();
      yield* eventBus.publishInfo(`Reconciled download ${id}`);
    });

    const syncDownloads = Effect.fn("OperationsService.syncDownloads")(function* () {
      yield* syncDownloadState("downloads.manual_sync").pipe(
        Effect.mapError(mapCommandError("Failed to sync downloads")),
      );
      yield* progressSupport.publishDownloadProgress();
      yield* eventBus.publishInfo("Download sync finished");
    });

    return CatalogDownloadCommandService.of({
      pauseDownload,
      reconcileDownload,
      removeDownload,
      resumeDownload,
      retryDownload,
      syncDownloads,
    });
  }),
);
