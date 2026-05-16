import { Layer } from "effect";

import { BackgroundSearchQueueServiceLive } from "@/features/operations/background-search/background-search-queue-service.ts";
import { BackgroundSearchRssFeedServiceLive } from "@/features/operations/background-search/background-search-rss-feed-service.ts";
import { BackgroundSearchRssWorkerServiceLive } from "@/features/operations/background-search/background-search-rss-worker-service.ts";
import { SearchBackgroundMissingServiceLive } from "@/features/operations/background-search/background-search-missing-support.ts";
import { SearchBackgroundRssServiceLive } from "@/features/operations/background-search/background-search-rss-support.ts";
import { CatalogDownloadCommandServiceLive } from "@/features/operations/catalog/catalog-download-command-service.ts";
import { CatalogDownloadReadServiceLive } from "@/features/operations/catalog/catalog-download-read-service.ts";
import { CatalogLibraryReadServiceLive } from "@/features/operations/catalog/catalog-library-read-service.ts";
import { CatalogLibraryScanServiceLive } from "@/features/operations/catalog/catalog-library-scan-service.ts";
import { CatalogLibraryWriteServiceLive } from "@/features/operations/catalog/catalog-library-write-service.ts";
import { CatalogRssServiceLive } from "@/features/operations/catalog/catalog-rss-service.ts";
import { DownloadProgressSupportLive } from "@/features/operations/download/download-progress-support.ts";
import { DownloadReconciliationServiceLive } from "@/features/operations/download/download-reconciliation-service.ts";
import { DownloadTorrentActionServiceLive } from "@/features/operations/download/download-torrent-action-support.ts";
import { DownloadTorrentSyncServiceLive } from "@/features/operations/download/download-torrent-sync-support.ts";
import { DownloadTriggerServiceLive } from "@/features/operations/download/download-trigger-service.ts";
import { ImportPathScanServiceLive } from "@/features/operations/import-scan/import-path-scan-service.ts";
import { LibraryRootsQueryServiceLive } from "@/features/operations/library/library-roots-query-service.ts";
import { ProgressLive } from "@/features/operations/tasks/operations-progress-service.ts";
import {
  OperationsTaskReadServiceLive,
  OperationsTaskWriteServiceLive,
} from "@/features/operations/tasks/operations-task-service.ts";
import {
  DownloadTriggerCoordinatorLive,
  UnmappedScanCoordinatorLive,
} from "@/features/operations/tasks/runtime-support.ts";
import { SearchEpisodeServiceLive } from "@/features/operations/search/search-orchestration-episode-support.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search/search-orchestration-release-search.ts";
import { TorrentClientServiceLive } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { UnmappedControlServiceLive } from "@/features/operations/unmapped/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped/unmapped-orchestration-import.ts";
import { UnmappedScanServiceLive } from "@/features/operations/unmapped/unmapped-scan-service.ts";

export function makeOperationsFeatureLayer<ROut, E, RIn>(
  runtimeSupportLayer: Layer.Layer<ROut, E, RIn>,
) {
  const operationsTaskReadLayer = OperationsTaskReadServiceLive.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const operationsTaskWriteLayer = OperationsTaskWriteServiceLive.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const operationsRuntimeLayer = Layer.mergeAll(
    runtimeSupportLayer,
    DownloadTriggerCoordinatorLive,
    UnmappedScanCoordinatorLive,
  );
  const torrentClientLayer = TorrentClientServiceLive.pipe(Layer.provide(operationsRuntimeLayer));
  const downloadRuntimeLayer = Layer.mergeAll(operationsRuntimeLayer, torrentClientLayer);
  const downloadReconciliationLayer = DownloadReconciliationServiceLive.pipe(
    Layer.provide(downloadRuntimeLayer),
  );
  const downloadActionLayer = DownloadTorrentActionServiceLive.pipe(
    Layer.provide(downloadRuntimeLayer),
  );
  const downloadSyncRuntimeLayer = Layer.mergeAll(
    downloadRuntimeLayer,
    downloadReconciliationLayer,
  );
  const downloadSyncLayer = DownloadTorrentSyncServiceLive.pipe(
    Layer.provide(downloadSyncRuntimeLayer),
  );
  const downloadProgressRuntimeLayer = Layer.mergeAll(
    downloadSyncRuntimeLayer,
    downloadActionLayer,
    downloadSyncLayer,
  );
  const downloadProgressSupportLayer = DownloadProgressSupportLive.pipe(
    Layer.provide(downloadProgressRuntimeLayer),
  );
  const triggerRuntimeLayer = Layer.mergeAll(
    downloadProgressRuntimeLayer,
    downloadProgressSupportLayer,
  );
  const downloadTriggerLayer = DownloadTriggerServiceLive.pipe(Layer.provide(triggerRuntimeLayer));
  const catalogDownloadReadLayer = CatalogDownloadReadServiceLive.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const catalogDownloadCommandLayer = CatalogDownloadCommandServiceLive.pipe(
    Layer.provide(Layer.mergeAll(downloadProgressRuntimeLayer, downloadProgressSupportLayer)),
  );
  const operationsProgressLayer = ProgressLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        triggerRuntimeLayer,
        downloadTriggerLayer,
        catalogDownloadReadLayer,
        catalogDownloadCommandLayer,
      ),
    ),
  );
  const runtimeWithProgressLayer = Layer.mergeAll(runtimeSupportLayer, operationsProgressLayer);
  const backgroundSearchQueueLayer = BackgroundSearchQueueServiceLive.pipe(
    Layer.provide(downloadRuntimeLayer),
  );
  const runtimeWithQueueLayer = Layer.mergeAll(runtimeSupportLayer, backgroundSearchQueueLayer);
  const backgroundSearchRssFeedLayer = BackgroundSearchRssFeedServiceLive.pipe(
    Layer.provide(runtimeWithQueueLayer),
  );
  const searchReleaseLayer = SearchReleaseServiceLive.pipe(Layer.provide(runtimeSupportLayer));
  const runtimeWithReleaseLayer = Layer.mergeAll(runtimeSupportLayer, searchReleaseLayer);
  const searchEpisodeLayer = SearchEpisodeServiceLive.pipe(Layer.provide(runtimeWithReleaseLayer));
  const searchBackgroundMissingLayer = SearchBackgroundMissingServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(runtimeWithProgressLayer, backgroundSearchQueueLayer, searchReleaseLayer),
    ),
  );
  const searchBackgroundRssLayer = SearchBackgroundRssServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        runtimeWithProgressLayer,
        backgroundSearchRssFeedLayer,
        backgroundSearchQueueLayer,
      ),
    ),
  );
  const backgroundSearchRssWorkerLayer = BackgroundSearchRssWorkerServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        runtimeWithProgressLayer,
        searchBackgroundRssLayer,
        searchBackgroundMissingLayer,
      ),
    ),
  );
  const catalogLibraryReadLayer = CatalogLibraryReadServiceLive.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const catalogLibraryWriteLayer = CatalogLibraryWriteServiceLive.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const catalogLibraryScanLayer = CatalogLibraryScanServiceLive.pipe(
    Layer.provide(runtimeWithProgressLayer),
  );
  const importPathScanLayer = ImportPathScanServiceLive.pipe(Layer.provide(runtimeSupportLayer));
  const catalogRssLayer = CatalogRssServiceLive.pipe(Layer.provide(runtimeSupportLayer));
  const libraryRootsQueryLayer = LibraryRootsQueryServiceLive.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const unmappedScanLayer = UnmappedScanServiceLive.pipe(Layer.provide(operationsRuntimeLayer));
  const unmappedControlLayer = UnmappedControlServiceLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeSupportLayer, unmappedScanLayer)),
  );
  const unmappedImportLayer = UnmappedImportServiceLive.pipe(Layer.provide(runtimeSupportLayer));
  const operationsLayer = Layer.mergeAll(
    torrentClientLayer,
    downloadReconciliationLayer,
    downloadActionLayer,
    downloadSyncLayer,
    downloadProgressSupportLayer,
    downloadTriggerLayer,
    catalogDownloadReadLayer,
    catalogDownloadCommandLayer,
    operationsProgressLayer,
    backgroundSearchQueueLayer,
    backgroundSearchRssFeedLayer,
    searchReleaseLayer,
    searchEpisodeLayer,
    searchBackgroundMissingLayer,
    searchBackgroundRssLayer,
    backgroundSearchRssWorkerLayer,
    catalogLibraryReadLayer,
    operationsTaskReadLayer,
    operationsTaskWriteLayer,
    catalogLibraryWriteLayer,
    catalogLibraryScanLayer,
    importPathScanLayer,
    catalogRssLayer,
    libraryRootsQueryLayer,
    unmappedScanLayer,
    unmappedControlLayer,
    unmappedImportLayer,
  );

  return operationsLayer;
}
