import { Effect } from "effect";

import { durationMsSince } from "@/lib/logging.ts";
import { mapQBitState } from "@/features/operations/download-orchestration-shared.ts";
import { makeDownloadProgressSupport } from "@/features/operations/download-progress-support.ts";
import { makeDownloadReconciliationService } from "@/features/operations/download-reconciliation-service.ts";
import { makeDownloadTorrentLifecycleService } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { makeDownloadTriggerService } from "@/features/operations/download-trigger-service.ts";

type DownloadReconciliationServiceShape = ReturnType<typeof makeDownloadReconciliationService>;
type DownloadProgressSupportShape = ReturnType<typeof makeDownloadProgressSupport>;
type DownloadTorrentLifecycleServiceShape = ReturnType<typeof makeDownloadTorrentLifecycleService>;
type DownloadTriggerServiceShape = ReturnType<typeof makeDownloadTriggerService>;

export function makeDownloadOrchestration(input: {
  readonly currentMonotonicMillis: () => Effect.Effect<number>;
  readonly reconciliationService: DownloadReconciliationServiceShape;
  readonly progressSupport: DownloadProgressSupportShape;
  readonly torrentLifecycleService: DownloadTorrentLifecycleServiceShape;
  readonly triggerService: DownloadTriggerServiceShape;
}) {
  const {
    currentMonotonicMillis,
    progressSupport,
    reconciliationService,
    torrentLifecycleService,
    triggerService,
  } = input;

  const syncDownloadState = Effect.fn("operations.downloads.sync_state")(function* (
    trigger: string,
  ) {
    const startedAt = yield* currentMonotonicMillis();

    yield* torrentLifecycleService.syncDownloadsWithQBitEffect();

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
    publishDownloadProgress: progressSupport.publishDownloadProgress,
    reconcileCompletedTorrentEffect: reconciliationService.reconcileCompletedTorrentEffect,
    reconcileDownloadByIdEffect: reconciliationService.reconcileDownloadByIdEffect,
    retryDownloadById: torrentLifecycleService.retryDownloadById,
    syncDownloadState,
    syncDownloadsWithQBitEffect: torrentLifecycleService.syncDownloadsWithQBitEffect,
    triggerDownload: triggerService.triggerDownload,
  };
}

export { mapQBitState };
