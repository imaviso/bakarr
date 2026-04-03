import { Layer } from "effect";

import { SearchBackgroundMissingServiceLive } from "@/features/operations/background-search-missing-support.ts";
import { BackgroundSearchRssFeedServiceLive } from "@/features/operations/background-search-rss-feed-service.ts";
import { SearchBackgroundRssServiceLive } from "@/features/operations/background-search-rss-support.ts";
import { BackgroundSearchRssWorkerServiceLive } from "@/features/operations/background-search-rss-worker-service.ts";
import { BackgroundSearchQueueServiceLive } from "@/features/operations/background-search-queue-service.ts";
import { CatalogDownloadCommandServiceLive } from "@/features/operations/catalog-download-command-service.ts";
import { CatalogDownloadReadServiceLive } from "@/features/operations/catalog-download-read-service.ts";
import { CatalogLibraryReadServiceLive } from "@/features/operations/catalog-library-read-service.ts";
import { CatalogLibraryScanServiceLive } from "@/features/operations/catalog-library-scan-service.ts";
import { CatalogLibraryWriteServiceLive } from "@/features/operations/catalog-library-write-service.ts";
import { CatalogRssServiceLive } from "@/features/operations/catalog-rss-service.ts";
import { DownloadProgressSupportLive } from "@/features/operations/download-progress-support.ts";
import { DownloadReconciliationServiceLive } from "@/features/operations/download-reconciliation-service.ts";
import { DownloadTorrentLifecycleServiceLive } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { DownloadTriggerServiceLive } from "@/features/operations/download-trigger-service.ts";
import { ImportPathScanServiceLive } from "@/features/operations/import-path-scan-service.ts";
import { LibraryRootsQueryServiceLive } from "@/features/operations/library-roots-query-service.ts";
import { ProgressLive } from "@/features/operations/operations-progress-service.ts";
import {
  DownloadTriggerCoordinatorLive,
  UnmappedScanCoordinatorLive,
} from "@/features/operations/runtime-support.ts";
import { SearchEpisodeServiceLive } from "@/features/operations/search-orchestration-episode-support.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search-orchestration-release-search.ts";
import { TorrentClientServiceLive } from "@/features/operations/torrent-client-service.ts";
import { UnmappedControlServiceLive } from "@/features/operations/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped-orchestration-import.ts";
import { UnmappedScanServiceLive } from "@/features/operations/unmapped-scan-service.ts";

export function makeOperationsAppLayers<ROut, E, RIn>(
  runtimeSupportLayer: Layer.Layer<ROut, E, RIn>,
) {
  const torrentClientLayer = TorrentClientServiceLive.pipe(Layer.provideMerge(runtimeSupportLayer));
  const downloadTriggerCoordinatorLayer = DownloadTriggerCoordinatorLive;
  const downloadReconciliationLayer = DownloadReconciliationServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, torrentClientLayer)),
  );
  const downloadTorrentLifecycleLayer = DownloadTorrentLifecycleServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(runtimeSupportLayer, torrentClientLayer, downloadReconciliationLayer),
    ),
  );
  const downloadProgressSupportLayer = DownloadProgressSupportLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, downloadTorrentLifecycleLayer)),
  );
  const downloadTriggerLayer = DownloadTriggerServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        runtimeSupportLayer,
        torrentClientLayer,
        downloadProgressSupportLayer,
        downloadTriggerCoordinatorLayer,
      ),
    ),
  );
  const catalogDownloadReadLayer = CatalogDownloadReadServiceLive.pipe(
    Layer.provideMerge(runtimeSupportLayer),
  );
  const catalogDownloadCommandLayer = CatalogDownloadCommandServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        runtimeSupportLayer,
        downloadReconciliationLayer,
        downloadTorrentLifecycleLayer,
        downloadProgressSupportLayer,
      ),
    ),
  );
  const operationsProgressLayer = ProgressLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        runtimeSupportLayer,
        downloadReconciliationLayer,
        downloadTorrentLifecycleLayer,
        downloadProgressSupportLayer,
        downloadTriggerLayer,
        catalogDownloadReadLayer,
        catalogDownloadCommandLayer,
      ),
    ),
  );
  const backgroundSearchQueueLayer = BackgroundSearchQueueServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(runtimeSupportLayer, torrentClientLayer, downloadTriggerCoordinatorLayer),
    ),
  );
  const backgroundSearchRssFeedLayer = BackgroundSearchRssFeedServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, backgroundSearchQueueLayer)),
  );
  const searchReleaseLayer = SearchReleaseServiceLive.pipe(Layer.provideMerge(runtimeSupportLayer));
  const searchEpisodeLayer = SearchEpisodeServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, searchReleaseLayer)),
  );
  const searchBackgroundMissingLayer = SearchBackgroundMissingServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        runtimeSupportLayer,
        backgroundSearchQueueLayer,
        operationsProgressLayer,
        searchReleaseLayer,
      ),
    ),
  );
  const searchBackgroundRssLayer = SearchBackgroundRssServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        runtimeSupportLayer,
        backgroundSearchRssFeedLayer,
        backgroundSearchQueueLayer,
        operationsProgressLayer,
      ),
    ),
  );
  const backgroundSearchRssWorkerLayer = BackgroundSearchRssWorkerServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        runtimeSupportLayer,
        searchBackgroundRssLayer,
        searchBackgroundMissingLayer,
        operationsProgressLayer,
      ),
    ),
  );
  const unmappedScanCoordinatorLayer = UnmappedScanCoordinatorLive;
  const unmappedScanLayer = UnmappedScanServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, unmappedScanCoordinatorLayer)),
  );
  const unmappedControlLayer = UnmappedControlServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, unmappedScanLayer)),
  );
  const unmappedImportLayer = UnmappedImportServiceLive.pipe(
    Layer.provideMerge(runtimeSupportLayer),
  );
  const catalogLibraryReadLayer = CatalogLibraryReadServiceLive.pipe(
    Layer.provideMerge(runtimeSupportLayer),
  );
  const catalogLibraryWriteLayer = CatalogLibraryWriteServiceLive.pipe(
    Layer.provideMerge(runtimeSupportLayer),
  );
  const catalogLibraryScanLayer = CatalogLibraryScanServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, operationsProgressLayer)),
  );
  const importPathScanLayer = ImportPathScanServiceLive.pipe(
    Layer.provideMerge(runtimeSupportLayer),
  );
  const catalogRssLayer = CatalogRssServiceLive.pipe(Layer.provideMerge(runtimeSupportLayer));
  const libraryRootsQueryLayer = LibraryRootsQueryServiceLive.pipe(
    Layer.provideMerge(runtimeSupportLayer),
  );
  const operationsLayer = Layer.mergeAll(
    torrentClientLayer,
    downloadTriggerCoordinatorLayer,
    downloadReconciliationLayer,
    downloadTorrentLifecycleLayer,
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
    unmappedScanCoordinatorLayer,
    unmappedScanLayer,
    unmappedControlLayer,
    unmappedImportLayer,
    catalogLibraryReadLayer,
    catalogLibraryWriteLayer,
    catalogLibraryScanLayer,
    importPathScanLayer,
    catalogRssLayer,
    libraryRootsQueryLayer,
  );

  return {
    catalogDownloadReadLayer,
    operationsLayer,
    operationsProgressLayer,
    torrentClientLayer,
  } as const;
}
