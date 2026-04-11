import { Context, Effect, Layer } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { DownloadReconciliationService } from "@/features/operations/download-reconciliation-service.ts";
import { DownloadTorrentLifecycleService } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { DownloadProgressSupport } from "@/features/operations/download-progress-support.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import {
  isOperationsError,
  type OperationsError,
  OperationsInfrastructureError,
} from "@/features/operations/errors.ts";
import { durationMsSince } from "@/lib/logging.ts";
import { ClockService } from "@/lib/clock.ts";

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
    const torrentLifecycle = yield* DownloadTorrentLifecycleService;
    const reconciliation = yield* DownloadReconciliationService;
    const progressSupport = yield* DownloadProgressSupport;
    const eventPublisher = yield* EventPublisher;

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

      yield* torrentLifecycle.syncDownloadsWithQBitEffect();

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
      yield* torrentLifecycle
        .applyDownloadActionEffect(id, "pause")
        .pipe(Effect.mapError(mapCommandError("Failed to pause download")));
      yield* eventPublisher.publishInfo(`Paused download ${id}`);
    });

    const resumeDownload = Effect.fn("OperationsService.resumeDownload")(function* (id: number) {
      yield* torrentLifecycle
        .applyDownloadActionEffect(id, "resume")
        .pipe(Effect.mapError(mapCommandError("Failed to resume download")));
      yield* eventPublisher.publishInfo(`Resumed download ${id}`);
    });

    const removeDownload = Effect.fn("OperationsService.removeDownload")(function* (
      id: number,
      deleteFiles: boolean,
    ) {
      yield* torrentLifecycle
        .applyDownloadActionEffect(id, "delete", deleteFiles)
        .pipe(Effect.mapError(mapCommandError("Failed to remove download")));
      yield* eventPublisher.publishInfo(`Removed download ${id}`);
    });

    const retryDownload = Effect.fn("OperationsService.retryDownload")(function* (id: number) {
      yield* torrentLifecycle
        .retryDownloadById(id)
        .pipe(Effect.mapError(mapCommandError("Failed to retry download")));
      yield* progressSupport.publishDownloadProgress();
      yield* eventPublisher.publishInfo(`Retried download ${id}`);
    });

    const reconcileDownload = Effect.fn("OperationsService.reconcileDownload")(function* (
      id: number,
    ) {
      yield* reconciliation
        .reconcileDownloadByIdEffect(id)
        .pipe(Effect.mapError(mapCommandError("Failed to reconcile download")));
      yield* progressSupport.publishDownloadProgress();
      yield* eventPublisher.publishInfo(`Reconciled download ${id}`);
    });

    const syncDownloads = Effect.fn("OperationsService.syncDownloads")(function* () {
      yield* syncDownloadState("downloads.manual_sync").pipe(
        Effect.mapError(mapCommandError("Failed to sync downloads")),
      );
      yield* progressSupport.publishDownloadProgress();
      yield* eventPublisher.publishInfo("Download sync finished");
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
