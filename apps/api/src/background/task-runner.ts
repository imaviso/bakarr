import { Effect } from "effect";

import { withLockEffectOrFail } from "@/background/workers.ts";
import { BackgroundWorkerMonitor } from "@/background/monitor.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { WorkerTimeoutError } from "@/background/workers.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import type { DomainPathError, InfrastructureError, StoredDataError } from "@/features/errors.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";
import type { UpsertUnitFileError } from "@/features/media/units/media-unit-repository.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { CatalogLibraryScanService } from "@/features/operations/catalog/catalog-library-scan-service.ts";
import type { DownloadTorrentSyncError } from "@/features/operations/download/download-torrent-sync-support.ts";
import { DownloadTorrentSyncService } from "@/features/operations/download/download-torrent-sync-support.ts";
import { MediaMaintenanceService } from "@/features/media/metadata/media-maintenance-service.ts";
import { ManamiCacheRefreshClient } from "@/features/media/metadata/manami.ts";
import { BackgroundSearchRssWorkerService } from "@/features/operations/background-search/background-search-rss-worker-service.ts";
import type { FileSystemError } from "@/infra/filesystem/filesystem.ts";
import type { ImportFileError } from "@/features/operations/download/download-file-import-errors.ts";

export type BackgroundTaskRunnerError =
  | DatabaseError
  | DomainPathError
  | InfrastructureError
  | ExternalCallError
  | StoredDataError
  | MediaNotFoundError
  | RuntimeConfigSnapshotError
  | DownloadTorrentSyncError
  | FileSystemError
  | UpsertUnitFileError
  | ImportFileError
  | WorkerTimeoutError;

export interface BackgroundTaskRunnerShape {
  readonly runDownloadSyncWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runLibraryScanWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runManamiRefreshWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runMetadataRefreshWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runRssWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
}

const makeBackgroundTaskRunner = Effect.fn("BackgroundTaskRunner.make")(function* () {
  const torrentSync = yield* DownloadTorrentSyncService;
  const catalogLibraryScanService = yield* CatalogLibraryScanService;
  const animeMaintenanceService = yield* MediaMaintenanceService;
  const backgroundSearchRssWorkerService = yield* BackgroundSearchRssWorkerService;
  const manami = yield* ManamiCacheRefreshClient;
  const monitor = yield* BackgroundWorkerMonitor;

  const runDownloadSyncTask = Effect.fn("Background.runDownloadSyncTask")(function* () {
    yield* torrentSync.syncDownloads();
  });
  const runLibraryScanTask = Effect.fn("Background.runLibraryScanTask")(function* () {
    yield* catalogLibraryScanService.runLibraryScan();
  });
  const runMetadataRefreshTask = Effect.fn("Background.runMetadataRefreshTask")(function* () {
    yield* animeMaintenanceService.refreshMetadataForMonitoredMedia().pipe(Effect.asVoid);
  });
  const runManamiRefreshTask = Effect.fn("Background.runManamiRefreshTask")(function* () {
    const refreshed = yield* manami.refreshCacheIfNeeded();
    yield* Effect.logInfo("Manami cache refresh checked").pipe(
      Effect.annotateLogs({
        provider: "Manami",
        refreshed,
      }),
    );
  });
  const runRssTask = Effect.fn("Background.runRssTask")(function* () {
    yield* backgroundSearchRssWorkerService.runRssWorker();
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

  return {
    runDownloadSyncWorkerTask,
    runLibraryScanWorkerTask,
    runManamiRefreshWorkerTask,
    runMetadataRefreshWorkerTask,
    runRssWorkerTask,
  } satisfies BackgroundTaskRunnerShape;
});

export class BackgroundTaskRunner extends Effect.Service<BackgroundTaskRunner>()(
  "@bakarr/api/BackgroundTaskRunner",
  {
    effect: makeBackgroundTaskRunner(),
  },
) {}

export const BackgroundTaskRunnerLive = BackgroundTaskRunner.Default;
