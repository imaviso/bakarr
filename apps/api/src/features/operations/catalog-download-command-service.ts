import { Context, Effect, Layer } from "effect";

import {
  makeCatalogDownloadActionSupport,
  type CatalogDownloadActionSupportShape,
} from "@/features/operations/catalog-orchestration-download-action-support.ts";
import { DownloadReconciliationService } from "@/features/operations/download-reconciliation-service.ts";
import { DownloadTorrentLifecycleService } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { DownloadProgressSupport } from "@/features/operations/download-progress-support.ts";
import { durationMsSince } from "@/lib/logging.ts";
import { ClockService } from "@/lib/clock.ts";

export type CatalogDownloadCommandServiceShape = CatalogDownloadActionSupportShape;

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

    return makeCatalogDownloadActionSupport({
      applyDownloadActionEffect: torrentLifecycle.applyDownloadActionEffect,
      publishDownloadProgress: progressSupport.publishDownloadProgress,
      reconcileDownloadByIdEffect: reconciliation.reconcileDownloadByIdEffect,
      retryDownloadById: torrentLifecycle.retryDownloadById,
      syncDownloadState,
    });
  }),
);
