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
import { ProgressLive } from "@/features/operations/operations-progress-service.ts";
import {
  DownloadTriggerCoordinatorLive,
  UnmappedScanCoordinatorLive,
} from "@/features/operations/runtime-support.ts";
import { TorrentClientServiceLive } from "@/features/operations/torrent-client-service.ts";
import { SearchEpisodeServiceLive } from "@/features/operations/search-orchestration-episode-support.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search-orchestration-release-search.ts";
import { UnmappedControlServiceLive } from "@/features/operations/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped-orchestration-import.ts";
import { UnmappedScanServiceLive } from "@/features/operations/unmapped-scan-service.ts";
import { LibraryRootsQueryServiceLive } from "@/features/operations/library-roots-query-service.ts";

const downloadTriggerCoordinatorLayer = DownloadTriggerCoordinatorLive;
const unmappedScanCoordinatorLayer = UnmappedScanCoordinatorLive;

const downloadReconciliationLayer = DownloadReconciliationServiceLive.pipe(
  Layer.provide(TorrentClientServiceLive),
);
const downloadTorrentLifecycleLayer = DownloadTorrentLifecycleServiceLive.pipe(
  Layer.provide(Layer.mergeAll(downloadReconciliationLayer, TorrentClientServiceLive)),
);
const downloadProgressSupportLayer = DownloadProgressSupportLive.pipe(
  Layer.provide(downloadTorrentLifecycleLayer),
);
const downloadTriggerLayer = DownloadTriggerServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      downloadProgressSupportLayer,
      downloadTriggerCoordinatorLayer,
      TorrentClientServiceLive,
    ),
  ),
);

const operationsDownloadBundleLayer = Layer.mergeAll(
  downloadReconciliationLayer,
  downloadTorrentLifecycleLayer,
  downloadProgressSupportLayer,
  downloadTriggerLayer,
  CatalogDownloadReadServiceLive,
  CatalogDownloadCommandServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        downloadReconciliationLayer,
        downloadTorrentLifecycleLayer,
        downloadProgressSupportLayer,
      ),
    ),
  ),
);

const operationsProgressLayer = ProgressLive.pipe(Layer.provide(operationsDownloadBundleLayer));

const backgroundSearchQueueLayer = BackgroundSearchQueueServiceLive.pipe(
  Layer.provide(Layer.mergeAll(downloadTriggerCoordinatorLayer, TorrentClientServiceLive)),
);
const backgroundSearchRssFeedLayer = BackgroundSearchRssFeedServiceLive.pipe(
  Layer.provide(backgroundSearchQueueLayer),
);
const searchReleaseLayer = SearchReleaseServiceLive;

const searchBackgroundMissingLayer = SearchBackgroundMissingServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(backgroundSearchQueueLayer, operationsProgressLayer, searchReleaseLayer),
  ),
);
const searchBackgroundRssLayer = SearchBackgroundRssServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      backgroundSearchRssFeedLayer,
      backgroundSearchQueueLayer,
      operationsProgressLayer,
    ),
  ),
);

const operationsBackgroundSearchBundleLayer = Layer.mergeAll(
  backgroundSearchQueueLayer,
  backgroundSearchRssFeedLayer,
  searchBackgroundMissingLayer,
  searchBackgroundRssLayer,
  BackgroundSearchRssWorkerServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        searchBackgroundRssLayer,
        searchBackgroundMissingLayer,
        operationsProgressLayer,
      ),
    ),
  ),
);

const searchEpisodeLayer = SearchEpisodeServiceLive.pipe(Layer.provide(searchReleaseLayer));

const operationsSearchBundleLayer = Layer.mergeAll(
  searchReleaseLayer,
  searchEpisodeLayer,
  operationsBackgroundSearchBundleLayer,
);

const unmappedScanLayer = UnmappedScanServiceLive.pipe(Layer.provide(unmappedScanCoordinatorLayer));
const unmappedControlLayer = UnmappedControlServiceLive.pipe(Layer.provide(unmappedScanLayer));

const operationsUnmappedBundleLayer = Layer.mergeAll(
  unmappedScanLayer,
  unmappedControlLayer,
  UnmappedImportServiceLive,
);

const catalogLibraryScanLayer = CatalogLibraryScanServiceLive.pipe(
  Layer.provide(operationsProgressLayer),
);

const operationsLibraryBundleLayer = Layer.mergeAll(
  CatalogLibraryReadServiceLive,
  CatalogLibraryWriteServiceLive,
  catalogLibraryScanLayer,
  ImportPathScanServiceLive,
  CatalogRssServiceLive,
  LibraryRootsQueryServiceLive,
);

const operationsRuntimeBundleLayer = Layer.mergeAll(
  downloadTriggerCoordinatorLayer,
  unmappedScanCoordinatorLayer,
  operationsProgressLayer,
);

export const OperationsFeatureLive = Layer.mergeAll(
  operationsRuntimeBundleLayer,
  TorrentClientServiceLive,
  operationsDownloadBundleLayer,
  operationsSearchBundleLayer,
  operationsLibraryBundleLayer,
  operationsUnmappedBundleLayer,
);
