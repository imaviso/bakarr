import { Layer } from "effect";

import { BackgroundSearchQueueServiceLive } from "@/features/operations/background-search/background-search-queue-service.ts";
import { BackgroundSearchRssFeedServiceLive } from "@/features/operations/background-search/background-search-rss-feed-service.ts";
import { BackgroundSearchRssWorkerServiceLive } from "@/features/operations/background-search/background-search-rss-worker-service.ts";
import { SearchBackgroundMissingServiceLive } from "@/features/operations/background-search/background-search-missing-service.ts";
import { SearchBackgroundRssServiceLive } from "@/features/operations/background-search/background-search-rss-service.ts";
import { CatalogDownloadReadServiceLive } from "@/features/operations/catalog/catalog-download-read-service.ts";
import { CatalogLibraryReadServiceLive } from "@/features/operations/catalog/catalog-library-read-service.ts";
import { CatalogLibraryScanServiceLive } from "@/features/operations/catalog/catalog-library-scan-service.ts";
import { CatalogLibraryWriteServiceLive } from "@/features/operations/catalog/catalog-library-write-service.ts";
import { CatalogRssServiceLive } from "@/features/operations/catalog/catalog-rss-service.ts";
import { DownloadProgressServiceLive } from "@/features/operations/download/download-progress-service.ts";
import { DownloadReconciliationServiceLive } from "@/features/operations/download/download-reconciliation-service.ts";
import { DownloadTorrentActionServiceLive } from "@/features/operations/download/download-torrent-action-service.ts";
import { DownloadTorrentSyncServiceLive } from "@/features/operations/download/download-torrent-sync-service.ts";
import { DownloadTriggerServiceLive } from "@/features/operations/download/download-trigger-service.ts";
import { ImportPathScanServiceLive } from "@/features/operations/import-scan/import-path-scan-service.ts";
import { LibraryBrowseServiceLive } from "@/features/operations/library/library-browse-service.ts";
import { OperationsProgressLive } from "@/features/operations/tasks/operations-progress-service.ts";
import {
  OperationsTaskReadServiceLive,
  OperationsTaskWriteServiceLive,
} from "@/features/operations/tasks/operations-task-service.ts";
import {
  DownloadTriggerCoordinatorLive,
  UnmappedScanCoordinatorLive,
} from "@/features/operations/tasks/runtime-support.ts";
import { SearchUnitServiceLive } from "@/features/operations/search/search-unit-service.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search/search-orchestration-release-search.ts";
import { TorrentClientServiceLive } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { UnmappedControlServiceLive } from "@/features/operations/unmapped/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped/unmapped-orchestration-import.ts";
import { UnmappedScanServiceLive } from "@/features/operations/unmapped/unmapped-scan-service.ts";
import { OperationsTaskLauncherServiceLive } from "@/features/operations/tasks/operations-task-launcher-service.ts";

export function makeOperationsFeatureLayer<ROut, E, RIn, LeavesOut, LeavesE, LeavesIn>(
  runtimeSupportLayer: Layer.Layer<ROut, E, RIn>,
  pureDbLeaves: Layer.Layer<LeavesOut, LeavesE, LeavesIn>,
) {
  const baseRuntime = Layer.mergeAll(
    runtimeSupportLayer,
    pureDbLeaves,
    DownloadTriggerCoordinatorLive,
    UnmappedScanCoordinatorLive,
  );

  const torrentClientLayer = TorrentClientServiceLive.pipe(Layer.provide(baseRuntime));
  const downloadProgressLayer = DownloadProgressServiceLive.pipe(Layer.provide(baseRuntime));
  const downloadCore = Layer.mergeAll(baseRuntime, torrentClientLayer, downloadProgressLayer);

  const downloadReconciliationLayer = DownloadReconciliationServiceLive.pipe(
    Layer.provide(downloadCore),
  );
  const downloadActionLayer = DownloadTorrentActionServiceLive.pipe(Layer.provide(downloadCore));
  const downloadSyncLayer = DownloadTorrentSyncServiceLive.pipe(
    Layer.provide(Layer.mergeAll(downloadCore, downloadReconciliationLayer)),
  );
  const downloadStack = Layer.mergeAll(
    downloadCore,
    downloadReconciliationLayer,
    downloadActionLayer,
    downloadSyncLayer,
  );
  const downloadTriggerLayer = DownloadTriggerServiceLive.pipe(Layer.provide(downloadStack));
  const catalogDownloadReadLayer = CatalogDownloadReadServiceLive.pipe(Layer.provide(baseRuntime));
  const operationsProgressLayer = OperationsProgressLive.pipe(
    Layer.provide(Layer.mergeAll(downloadCore, downloadProgressLayer)),
  );
  const runtimeWithProgress = Layer.mergeAll(baseRuntime, operationsProgressLayer);

  const backgroundSearchQueueLayer = BackgroundSearchQueueServiceLive.pipe(
    Layer.provide(downloadCore),
  );
  const backgroundSearchRssFeedLayer = BackgroundSearchRssFeedServiceLive.pipe(
    Layer.provide(Layer.mergeAll(baseRuntime, backgroundSearchQueueLayer)),
  );
  const searchReleaseLayer = SearchReleaseServiceLive.pipe(Layer.provide(baseRuntime));
  const searchUnitLayer = SearchUnitServiceLive.pipe(
    Layer.provide(Layer.mergeAll(baseRuntime, searchReleaseLayer)),
  );
  const searchBackgroundMissingLayer = SearchBackgroundMissingServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(runtimeWithProgress, backgroundSearchQueueLayer, searchReleaseLayer),
    ),
  );
  const searchBackgroundRssLayer = SearchBackgroundRssServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(runtimeWithProgress, backgroundSearchRssFeedLayer, backgroundSearchQueueLayer),
    ),
  );
  const backgroundSearchRssWorkerLayer = BackgroundSearchRssWorkerServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(runtimeWithProgress, searchBackgroundRssLayer, searchBackgroundMissingLayer),
    ),
  );

  const catalogLibraryReadLayer = CatalogLibraryReadServiceLive.pipe(Layer.provide(baseRuntime));
  const catalogLibraryWriteLayer = CatalogLibraryWriteServiceLive.pipe(Layer.provide(baseRuntime));
  const catalogLibraryScanLayer = CatalogLibraryScanServiceLive.pipe(
    Layer.provide(runtimeWithProgress),
  );
  const importPathScanLayer = ImportPathScanServiceLive.pipe(Layer.provide(baseRuntime));
  const catalogRssLayer = CatalogRssServiceLive.pipe(Layer.provide(baseRuntime));
  const unmappedScanLayer = UnmappedScanServiceLive.pipe(Layer.provide(baseRuntime));
  const unmappedControlLayer = UnmappedControlServiceLive.pipe(
    Layer.provide(Layer.mergeAll(baseRuntime, unmappedScanLayer)),
  );
  const unmappedImportLayer = UnmappedImportServiceLive.pipe(Layer.provide(baseRuntime));
  const operationsTaskReadLayer = OperationsTaskReadServiceLive.pipe(Layer.provide(baseRuntime));
  const operationsTaskWriteLayer = OperationsTaskWriteServiceLive.pipe(Layer.provide(baseRuntime));
  const operationsTaskLauncherLayer = OperationsTaskLauncherServiceLive.pipe(
    Layer.provide(Layer.mergeAll(baseRuntime, operationsTaskWriteLayer)),
  );

  // pureDbLeaves provided once at lifecycle — not re-exported here
  return Layer.mergeAll(
    torrentClientLayer,
    downloadReconciliationLayer,
    downloadActionLayer,
    downloadSyncLayer,
    downloadProgressLayer,
    downloadTriggerLayer,
    catalogDownloadReadLayer,
    operationsProgressLayer,
    backgroundSearchQueueLayer,
    backgroundSearchRssFeedLayer,
    searchReleaseLayer,
    searchUnitLayer,
    searchBackgroundMissingLayer,
    searchBackgroundRssLayer,
    backgroundSearchRssWorkerLayer,
    catalogLibraryReadLayer,
    operationsTaskReadLayer,
    operationsTaskWriteLayer,
    operationsTaskLauncherLayer,
    catalogLibraryWriteLayer,
    catalogLibraryScanLayer,
    importPathScanLayer,
    catalogRssLayer,
    unmappedScanLayer,
    unmappedControlLayer,
    unmappedImportLayer,
    LibraryBrowseServiceLive,
  );
}
