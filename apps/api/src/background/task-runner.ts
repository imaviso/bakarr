// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)

import type { AsyncOperationAccepted } from "@packages/shared/index.ts";
import { withLockEffectOrFail } from "@/background/workers.ts";
import { BackgroundWorkerMonitor } from "@/background/monitor.ts";
import type { WorkerTimeoutError } from "@/background/workers.ts";
import type { DatabaseError } from "@/db/database.ts";
import { InfrastructureError } from "@/features/errors.ts";
import { CatalogLibraryScanService } from "@/features/operations/catalog/catalog-library-scan-service.ts";
import { DownloadTorrentSyncService } from "@/features/operations/download/download-torrent-sync-service.ts";
import { MediaMaintenanceService } from "@/features/media/metadata/media-maintenance-service.ts";
import { ManamiCacheRefreshClient } from "@/features/media/metadata/manami.ts";
import { BackgroundSearchRssWorkerService } from "@/features/operations/background-search/background-search-rss-worker-service.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { Context, Effect, Layer } from "effect";

/** Job edge only — domain/infra tags mapped into InfrastructureError; timeout stays typed. */
export type BackgroundTaskRunnerError = WorkerTimeoutError | InfrastructureError;

export interface BackgroundTaskRunnerShape {
  readonly runDownloadSyncWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runLibraryScanWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runManamiRefreshWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runMetadataRefreshWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runRssWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly startLibraryScan: () => Effect.Effect<
    AsyncOperationAccepted,
    DatabaseError | InfrastructureError
  >;
  readonly startMetadataRefresh: () => Effect.Effect<
    AsyncOperationAccepted,
    DatabaseError | InfrastructureError
  >;
  readonly startRssProcessing: () => Effect.Effect<
    AsyncOperationAccepted,
    DatabaseError | InfrastructureError
  >;
}

const mapWorkerFailure =
  (job: string) =>
  (error: unknown): InfrastructureError =>
    new InfrastructureError({
      message: `Background worker '${job}' failed`,
      cause: error,
    });

const makeBackgroundTaskRunner = Effect.fn("BackgroundTaskRunner.make")(function* () {
  const torrentSync = yield* DownloadTorrentSyncService;
  const catalogLibraryScanService = yield* CatalogLibraryScanService;
  const mediaMaintenanceService = yield* MediaMaintenanceService;
  const backgroundSearchRssWorkerService = yield* BackgroundSearchRssWorkerService;
  const manami = yield* ManamiCacheRefreshClient;
  const monitor = yield* BackgroundWorkerMonitor;
  const taskLauncher = yield* OperationsTaskLauncherService;

  const runDownloadSyncTask = Effect.fn("Background.runDownloadSyncTask")(function* () {
    yield* torrentSync.syncDownloads().pipe(Effect.mapError(mapWorkerFailure("download_sync")));
  });
  const runLibraryScanTask = Effect.fn("Background.runLibraryScanTask")(function* () {
    yield* catalogLibraryScanService
      .runLibraryScan()
      .pipe(Effect.mapError(mapWorkerFailure("library_scan")));
  });
  const runMetadataRefreshTask = Effect.fn("Background.runMetadataRefreshTask")(function* () {
    yield* mediaMaintenanceService
      .refreshMetadataForMonitoredMedia()
      .pipe(Effect.mapError(mapWorkerFailure("metadata_refresh")), Effect.asVoid);
  });
  const runManamiRefreshTask = Effect.fn("Background.runManamiRefreshTask")(function* () {
    const refreshed = yield* manami
      .refreshCacheIfNeeded()
      .pipe(Effect.mapError(mapWorkerFailure("manami_refresh")));
    yield* Effect.logInfo("Manami cache refresh checked").pipe(
      Effect.annotateLogs({
        provider: "Manami",
        refreshed,
      }),
    );
  });
  const runRssTask = Effect.fn("Background.runRssTask")(function* () {
    yield* backgroundSearchRssWorkerService
      .runRssWorker()
      .pipe(Effect.mapError(mapWorkerFailure("rss")));
  });

  const downloadSyncWorkerTask = yield* withLockEffectOrFail(
    "download_sync",
    runDownloadSyncTask(),
    monitor,
  );
  const libraryScanWorkerTask = yield* withLockEffectOrFail(
    "library_scan",
    runLibraryScanTask(),
    monitor,
  );
  const metadataRefreshWorkerTask = yield* withLockEffectOrFail(
    "metadata_refresh",
    runMetadataRefreshTask(),
    monitor,
  );
  const manamiRefreshWorkerTask = yield* withLockEffectOrFail(
    "manami_refresh",
    runManamiRefreshTask(),
    monitor,
  );
  const rssWorkerTask = yield* withLockEffectOrFail("rss", runRssTask(), monitor);

  const runDownloadSyncWorkerTask = Effect.fn("BackgroundTaskRunner.runDownloadSyncWorkerTask")(
    () => downloadSyncWorkerTask,
  );
  const runLibraryScanWorkerTask = Effect.fn("BackgroundTaskRunner.runLibraryScanWorkerTask")(
    () => libraryScanWorkerTask,
  );
  const runMetadataRefreshWorkerTask = Effect.fn(
    "BackgroundTaskRunner.runMetadataRefreshWorkerTask",
  )(() => metadataRefreshWorkerTask);
  const runManamiRefreshWorkerTask = Effect.fn("BackgroundTaskRunner.runManamiRefreshWorkerTask")(
    () => manamiRefreshWorkerTask,
  );
  const runRssWorkerTask = Effect.fn("BackgroundTaskRunner.runRssWorkerTask")(() => rssWorkerTask);

  const startLibraryScan = Effect.fn("BackgroundTaskRunner.startLibraryScan")(function* () {
    return yield* taskLauncher.launch({
      failureMessage: "Manual system scan task failed",
      operation: () => runLibraryScanWorkerTask(),
      queuedMessage: "Queued manual system scan task",
      runningMessage: "Running manual system scan task",
      successMessage: () => "Manual system scan task finished",
      taskKey: "system_task_scan_manual",
    });
  });

  const startRssProcessing = Effect.fn("BackgroundTaskRunner.startRssProcessing")(function* () {
    return yield* taskLauncher.launch({
      failureMessage: "Manual RSS task failed",
      operation: () => runRssWorkerTask(),
      queuedMessage: "Queued manual RSS task",
      runningMessage: "Running manual RSS task",
      successMessage: () => "Manual RSS task finished",
      taskKey: "system_task_rss_manual",
    });
  });

  const startMetadataRefresh = Effect.fn("BackgroundTaskRunner.startMetadataRefresh")(function* () {
    return yield* taskLauncher.launch({
      failureMessage: "Manual metadata refresh task failed",
      operation: () => runMetadataRefreshWorkerTask(),
      queuedMessage: "Queued manual metadata refresh task",
      runningMessage: "Running manual metadata refresh task",
      successMessage: () => "Manual metadata refresh task finished",
      taskKey: "system_task_metadata_refresh_manual",
    });
  });

  return {
    runDownloadSyncWorkerTask,
    runLibraryScanWorkerTask,
    runManamiRefreshWorkerTask,
    runMetadataRefreshWorkerTask,
    runRssWorkerTask,
    startLibraryScan,
    startMetadataRefresh,
    startRssProcessing,
  } satisfies BackgroundTaskRunnerShape;
});

export class BackgroundTaskRunner extends Context.Service<
  BackgroundTaskRunner,
  BackgroundTaskRunnerShape
>()("@bakarr/api/BackgroundTaskRunner") {
  static readonly layer = Layer.effect(BackgroundTaskRunner, makeBackgroundTaskRunner());
}

export const BackgroundTaskRunnerLive = BackgroundTaskRunner.layer;
