import { Context, Effect, Layer } from "effect";

import { withLockEffectOrFail } from "@/background-workers.ts";
import { BackgroundWorkerMonitor } from "@/background-monitor.ts";
import { ClockService } from "@/lib/clock.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { WorkerTimeoutError } from "@/background-workers.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import type { AnimeServiceError } from "@/features/anime/errors.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { CatalogDownloadCommandService } from "@/features/operations/catalog-download-command-service.ts";
import { CatalogLibraryScanService } from "@/features/operations/catalog-library-scan-service.ts";
import { AnimeMaintenanceService } from "@/features/anime/anime-maintenance-service.ts";
import { BackgroundSearchRssWorkerService } from "@/features/operations/background-search-rss-worker-service.ts";

export type BackgroundTaskRunnerError =
  | AnimeServiceError
  | DatabaseError
  | ExternalCallError
  | OperationsError
  | RuntimeConfigSnapshotError
  | WorkerTimeoutError;

export interface BackgroundTaskRunnerShape {
  readonly runDownloadSyncWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runLibraryScanWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runMetadataRefreshWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runRssWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
}

export class BackgroundTaskRunner extends Context.Tag("@bakarr/api/BackgroundTaskRunner")<
  BackgroundTaskRunner,
  BackgroundTaskRunnerShape
>() {}

const makeBackgroundTaskRunner = Effect.fn("Background.makeBackgroundTaskRunner")(
  function* (input: {
    readonly downloadCommandService: typeof CatalogDownloadCommandService.Service;
    readonly catalogLibraryScanService: typeof CatalogLibraryScanService.Service;
    readonly animeMaintenanceService: typeof AnimeMaintenanceService.Service;
    readonly backgroundSearchRssWorkerService: typeof BackgroundSearchRssWorkerService.Service;
    readonly monitor: typeof BackgroundWorkerMonitor.Service;
    readonly clock: typeof ClockService.Service;
  }) {
    const runDownloadSyncTask = Effect.fn("Background.runDownloadSyncTask")(function* () {
      yield* input.downloadCommandService.syncDownloads();
    });
    const runLibraryScanTask = Effect.fn("Background.runLibraryScanTask")(function* () {
      yield* input.catalogLibraryScanService.runLibraryScan();
    });
    const runMetadataRefreshTask = Effect.fn("Background.runMetadataRefreshTask")(function* () {
      yield* input.animeMaintenanceService.refreshMetadataForMonitoredAnime().pipe(Effect.asVoid);
    });
    const runRssTask = Effect.fn("Background.runRssTask")(function* () {
      yield* input.backgroundSearchRssWorkerService.runRssWorker();
    });

    const runDownloadSyncWorkerTask = yield* withLockEffectOrFail(
      "download_sync",
      runDownloadSyncTask(),
      input.monitor,
      input.clock,
    );
    const runLibraryScanWorkerTask = yield* withLockEffectOrFail(
      "library_scan",
      runLibraryScanTask(),
      input.monitor,
      input.clock,
    );
    const runMetadataRefreshWorkerTask = yield* withLockEffectOrFail(
      "metadata_refresh",
      runMetadataRefreshTask(),
      input.monitor,
      input.clock,
    );
    const runRssWorkerTask = yield* withLockEffectOrFail(
      "rss",
      runRssTask(),
      input.monitor,
      input.clock,
    );

    return {
      runDownloadSyncWorkerTask: Effect.fn("BackgroundTaskRunner.runDownloadSyncWorkerTask")(
        () => runDownloadSyncWorkerTask,
      ),
      runLibraryScanWorkerTask: Effect.fn("BackgroundTaskRunner.runLibraryScanWorkerTask")(
        () => runLibraryScanWorkerTask,
      ),
      runMetadataRefreshWorkerTask: Effect.fn("BackgroundTaskRunner.runMetadataRefreshWorkerTask")(
        () => runMetadataRefreshWorkerTask,
      ),
      runRssWorkerTask: Effect.fn("BackgroundTaskRunner.runRssWorkerTask")(() => runRssWorkerTask),
    } satisfies BackgroundTaskRunnerShape;
  },
);

export const BackgroundTaskRunnerLive = Layer.effect(
  BackgroundTaskRunner,
  Effect.gen(function* () {
    const downloadCommandService = yield* CatalogDownloadCommandService;
    const catalogLibraryScanService = yield* CatalogLibraryScanService;
    const animeMaintenanceService = yield* AnimeMaintenanceService;
    const backgroundSearchRssWorkerService = yield* BackgroundSearchRssWorkerService;
    const monitor = yield* BackgroundWorkerMonitor;
    const clock = yield* ClockService;

    return yield* makeBackgroundTaskRunner({
      animeMaintenanceService,
      backgroundSearchRssWorkerService,
      catalogLibraryScanService,
      clock,
      downloadCommandService,
      monitor,
    });
  }),
);
