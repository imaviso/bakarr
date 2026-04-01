import { Layer } from "effect";

import { SearchBackgroundMissingServiceLive } from "@/features/operations/background-search-missing-support.ts";
import { SearchBackgroundRssServiceLive } from "@/features/operations/background-search-rss-support.ts";
import { BackgroundSearchQualityProfileServiceLive } from "@/features/operations/background-search-quality-profile-service.ts";
import { BackgroundSearchQueueServiceLive } from "@/features/operations/background-search-queue-service.ts";
import { BackgroundSearchRssRunnerServiceLive } from "@/features/operations/background-search-rss-runner-service.ts";
import { BackgroundSearchSkipLogServiceLive } from "@/features/operations/background-search-skip-log-service.ts";
import { CatalogDownloadCommandServiceLive } from "@/features/operations/catalog-download-command-service.ts";
import { CatalogDownloadReadServiceLive } from "@/features/operations/catalog-download-read-service.ts";
import { CatalogLibraryReadServiceLive } from "@/features/operations/catalog-library-read-support.ts";
import { CatalogLibraryScanServiceLive } from "@/features/operations/catalog-library-scan-support.ts";
import { CatalogLibraryWriteServiceLive } from "@/features/operations/catalog-orchestration-library-write-support.ts";
import { CatalogRssServiceLive } from "@/features/operations/catalog-rss-service.ts";
import { DownloadProgressSupportLive } from "@/features/operations/download-progress-support.ts";
import { DownloadReconciliationServiceLive } from "@/features/operations/download-reconciliation-service.ts";
import { DownloadTorrentLifecycleServiceLive } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { DownloadTriggerServiceLive } from "@/features/operations/download-trigger-coordinator-service.ts";
import { ProgressLive } from "@/features/operations/operations-progress-service.ts";
import {
  DownloadTriggerCoordinatorLive,
  UnmappedScanCoordinatorLive,
} from "@/features/operations/runtime-support.ts";
import { SearchEpisodeServiceLive } from "@/features/operations/search-orchestration-episode-support.ts";
import { SearchImportPathServiceLive } from "@/features/operations/search-orchestration-import-path-support.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search-orchestration-release-search.ts";
import { UnmappedControlServiceLive } from "@/features/operations/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped-import-service.ts";
import {
  UnmappedScanMatchServiceLive,
  UnmappedScanServiceLive,
} from "@/features/operations/unmapped-scan-service.ts";
import { LibraryRootsQueryServiceLive } from "@/features/operations/library-roots-query-service.ts";

const downloadTriggerCoordinatorLayer = DownloadTriggerCoordinatorLive;
const unmappedScanCoordinatorLayer = UnmappedScanCoordinatorLive;
const downloadReconciliationLayer = DownloadReconciliationServiceLive;
const downloadTorrentLifecycleLayer = DownloadTorrentLifecycleServiceLive.pipe(
  Layer.provide(downloadReconciliationLayer),
);
const downloadProgressSupportLayer = DownloadProgressSupportLive.pipe(
  Layer.provide(downloadTorrentLifecycleLayer),
);
const downloadTriggerLayer = DownloadTriggerServiceLive.pipe(
  Layer.provide(Layer.mergeAll(downloadProgressSupportLayer, downloadTriggerCoordinatorLayer)),
);
const operationsProgressLayer = ProgressLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      downloadReconciliationLayer,
      downloadTorrentLifecycleLayer,
      downloadProgressSupportLayer,
      downloadTriggerLayer,
    ),
  ),
);
const searchReleaseLayer = SearchReleaseServiceLive;
const searchEpisodeLayer = SearchEpisodeServiceLive.pipe(Layer.provide(searchReleaseLayer));
const unmappedScanLayer = UnmappedScanServiceLive.pipe(Layer.provide(unmappedScanCoordinatorLayer));
const unmappedScanMatchLayer = UnmappedScanMatchServiceLive;
const unmappedControlLayer = UnmappedControlServiceLive.pipe(Layer.provide(unmappedScanMatchLayer));
const unmappedImportLayer = UnmappedImportServiceLive;
const backgroundSearchQualityProfileLayer = BackgroundSearchQualityProfileServiceLive;
const backgroundSearchSkipLogLayer = BackgroundSearchSkipLogServiceLive;
const backgroundSearchQueueLayer = BackgroundSearchQueueServiceLive.pipe(
  Layer.provide(downloadTriggerCoordinatorLayer),
);
const backgroundSearchRssRunnerLayer = BackgroundSearchRssRunnerServiceLive;
const searchBackgroundMissingLayer = SearchBackgroundMissingServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      backgroundSearchQualityProfileLayer,
      backgroundSearchQueueLayer,
      backgroundSearchSkipLogLayer,
      operationsProgressLayer,
      searchReleaseLayer,
    ),
  ),
);
const searchBackgroundRssLayer = SearchBackgroundRssServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      backgroundSearchQualityProfileLayer,
      backgroundSearchQueueLayer,
      backgroundSearchSkipLogLayer,
      backgroundSearchRssRunnerLayer,
      operationsProgressLayer,
    ),
  ),
);
const catalogDownloadReadLayer = CatalogDownloadReadServiceLive;
const catalogDownloadCommandLayer = CatalogDownloadCommandServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      downloadReconciliationLayer,
      downloadTorrentLifecycleLayer,
      downloadProgressSupportLayer,
    ),
  ),
);
const catalogRssLayer = CatalogRssServiceLive;
const catalogLibraryScanLayer = CatalogLibraryScanServiceLive.pipe(
  Layer.provide(operationsProgressLayer),
);

const downloadCoreLayer = Layer.mergeAll(
  downloadReconciliationLayer,
  downloadTorrentLifecycleLayer,
  downloadProgressSupportLayer,
  downloadTriggerLayer,
);
const backgroundSearchCoreLayer = Layer.mergeAll(
  backgroundSearchQualityProfileLayer,
  backgroundSearchQueueLayer,
  backgroundSearchSkipLogLayer,
);
const unmappedCoreLayer = Layer.mergeAll(
  unmappedScanLayer,
  unmappedScanMatchLayer,
  unmappedControlLayer,
  unmappedImportLayer,
);
const catalogCoreLayer = Layer.mergeAll(
  catalogDownloadReadLayer,
  catalogDownloadCommandLayer,
  catalogRssLayer,
  CatalogLibraryReadServiceLive,
  CatalogLibraryWriteServiceLive,
  catalogLibraryScanLayer,
);
const searchCoreLayer = Layer.mergeAll(
  searchReleaseLayer,
  searchEpisodeLayer,
  SearchImportPathServiceLive,
  searchBackgroundMissingLayer,
  searchBackgroundRssLayer,
);

export const OperationsFeatureLive = Layer.mergeAll(
  downloadTriggerCoordinatorLayer,
  unmappedScanCoordinatorLayer,
  backgroundSearchRssRunnerLayer,
  backgroundSearchCoreLayer,
  downloadCoreLayer,
  operationsProgressLayer,
  catalogCoreLayer,
  unmappedCoreLayer,
  searchCoreLayer,
  LibraryRootsQueryServiceLive,
);
