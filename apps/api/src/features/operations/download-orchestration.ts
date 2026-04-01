import { Effect } from "effect";

import { durationMsSince } from "@/lib/logging.ts";
import { mapQBitState } from "@/features/operations/download-orchestration-shared.ts";
import type { DownloadProgressSupportShape } from "@/features/operations/download-progress-support.ts";
import type { DownloadReconciliationServiceShape } from "@/features/operations/download-reconciliation-service.ts";
import type { DownloadTorrentLifecycleServiceShape } from "@/features/operations/download-torrent-lifecycle-service.ts";
import type { DownloadTriggerServiceShape } from "@/features/operations/download-trigger-coordinator-service.ts";

export type DownloadWorkflowShape = ReturnType<typeof makeDownloadOrchestration>;

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
