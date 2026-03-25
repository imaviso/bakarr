import { Effect } from "effect";

import { currentMonotonicMillis } from "../../lib/clock.ts";
import { durationMsSince } from "../../lib/logging.ts";
import { DatabaseError } from "../../db/database.ts";
import { makeDownloadReconciliationService } from "./download-reconciliation-service.ts";
import { makeDownloadTorrentLifecycleService } from "./download-torrent-lifecycle-service.ts";
import { makeDownloadTriggerService } from "./download-trigger-service.ts";
import { type DownloadOrchestrationInput, mapQBitState } from "./download-orchestration-shared.ts";

export function makeDownloadOrchestration(input: DownloadOrchestrationInput) {
  const reconciliationService = makeDownloadReconciliationService(input);

  const torrentLifecycleService = makeDownloadTorrentLifecycleService({
    ...input,
    reconcileCompletedTorrentEffect: reconciliationService.reconcileCompletedTorrentEffect,
  });

  const triggerService = makeDownloadTriggerService({
    ...input,
    syncDownloadsWithQBitEffect: torrentLifecycleService.syncDownloadsWithQBitEffect,
  });

  const syncDownloadState = Effect.fn("OperationsService.syncDownloadState")(function* (
    trigger: string,
  ) {
    return yield* Effect.gen(function* () {
      const startedAt = yield* currentMonotonicMillis;

      yield* torrentLifecycleService
        .syncDownloadsWithQBitEffect()
        .pipe(
          Effect.catchAll((error) =>
            error instanceof DatabaseError
              ? Effect.fail(error)
              : Effect.fail(input.dbError("Failed to sync downloads with qBittorrent")(error)),
          ),
        );

      const finishedAt = yield* currentMonotonicMillis;

      yield* Effect.logInfo("download state sync completed").pipe(
        Effect.annotateLogs({
          component: "downloads",
          durationMs: durationMsSince(startedAt, finishedAt),
          syncTrigger: trigger,
        }),
      );
    }).pipe(Effect.withSpan("operations.downloads.sync_state"));
  });

  return {
    applyDownloadActionEffect: torrentLifecycleService.applyDownloadActionEffect,
    getDownloadProgressSnapshotEffect: triggerService.getDownloadProgressSnapshotEffect,
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
