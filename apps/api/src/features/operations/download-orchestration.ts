import { Effect } from "effect";

import { durationMsSince } from "@/lib/logging.ts";
import { DatabaseError } from "@/db/database.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { mapQBitState } from "@/features/operations/download-orchestration-shared.ts";
import { makeDownloadReconciliationService } from "@/features/operations/download-reconciliation-service.ts";
import { makeDownloadTorrentLifecycleService } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { makeDownloadTriggerService } from "@/features/operations/download-trigger-service.ts";

type DownloadReconciliationServiceShape = ReturnType<typeof makeDownloadReconciliationService>;
type DownloadTorrentLifecycleServiceShape = ReturnType<typeof makeDownloadTorrentLifecycleService>;
type DownloadTriggerServiceShape = ReturnType<typeof makeDownloadTriggerService>;

export function makeDownloadOrchestration(input: {
  readonly currentMonotonicMillis: () => Effect.Effect<number>;
  readonly reconciliationService: DownloadReconciliationServiceShape;
  readonly torrentLifecycleService: DownloadTorrentLifecycleServiceShape;
  readonly triggerService: DownloadTriggerServiceShape;
}) {
  const { currentMonotonicMillis, reconciliationService, torrentLifecycleService, triggerService } =
    input;

  const syncDownloadState = Effect.fn("operations.downloads.sync_state")(function* (
    trigger: string,
  ) {
    const startedAt = yield* currentMonotonicMillis();

    yield* torrentLifecycleService.syncDownloadsWithQBitEffect().pipe(
      Effect.catchAll((error) =>
        Effect.fail(
          error instanceof DatabaseError
            ? error
            : new OperationsInfrastructureError({
                message: "Failed to sync downloads with qBittorrent",
                cause: error,
              }),
        ),
      ),
    );

    const finishedAt = yield* currentMonotonicMillis();

    yield* Effect.logInfo("download state sync completed").pipe(
      Effect.annotateLogs({
        component: "downloads",
        durationMs: durationMsSince(startedAt, finishedAt),
        syncTrigger: trigger,
      }),
    );
  });

  return {
    applyDownloadActionEffect: torrentLifecycleService.applyDownloadActionEffect,
    maybeCleanupImportedTorrent: reconciliationService.maybeCleanupImportedTorrent,
    publishDownloadProgress: triggerService.publishDownloadProgress,
    reconcileCompletedTorrentEffect: reconciliationService.reconcileCompletedTorrentEffect,
    reconcileDownloadByIdEffect: reconciliationService.reconcileDownloadByIdEffect,
    retryDownloadById: torrentLifecycleService.retryDownloadById,
    syncDownloadState,
    syncDownloadsWithQBitEffect: torrentLifecycleService.syncDownloadsWithQBitEffect,
    triggerDownload: triggerService.triggerDownload,
  };
}

export { mapQBitState };
