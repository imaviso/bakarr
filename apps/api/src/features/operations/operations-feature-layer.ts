import { Layer } from "effect";

import { BackgroundSearchSharedLive } from "@/features/operations/background-search-support-shared.ts";
import { SearchBackgroundMissingServiceLive } from "@/features/operations/background-search-missing-support.ts";
import { SearchBackgroundRssServiceLive } from "@/features/operations/background-search-rss-support.ts";
import { CatalogDownloadServiceLive } from "@/features/operations/catalog-download-orchestration.ts";
import { CatalogLibraryReadServiceLive } from "@/features/operations/catalog-library-read-support.ts";
import { CatalogLibraryScanServiceLive } from "@/features/operations/catalog-library-scan-support.ts";
import { CatalogLibraryWriteServiceLive } from "@/features/operations/catalog-orchestration-library-write-support.ts";
import { DownloadProgressServiceLive } from "@/features/operations/catalog-download-view-support.ts";
import { DownloadProgressSupportLive } from "@/features/operations/download-progress-support.ts";
import { DownloadReconciliationServiceLive } from "@/features/operations/download-reconciliation-service.ts";
import { DownloadTorrentLifecycleServiceLive } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { DownloadTriggerServiceLive } from "@/features/operations/download-trigger-coordinator-service.ts";
import { DownloadWorkflowLive } from "@/features/operations/download-workflow-service.ts";
import { ProgressLive } from "@/features/operations/operations-progress-service.ts";
import {
  DownloadTriggerCoordinatorLive,
  UnmappedScanCoordinatorLive,
} from "@/features/operations/runtime-support.ts";
import { SearchEpisodeServiceLive } from "@/features/operations/search-orchestration-episode-support.ts";
import { SearchImportPathServiceLive } from "@/features/operations/search-orchestration-import-path-support.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search-orchestration-release-search.ts";
import { SearchUnmappedServiceLive } from "@/features/operations/search-unmapped-service.ts";

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
const downloadWorkflowLayer = DownloadWorkflowLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      downloadReconciliationLayer,
      downloadTorrentLifecycleLayer,
      downloadProgressSupportLayer,
      downloadTriggerLayer,
    ),
  ),
);
const operationsProgressLayer = ProgressLive.pipe(Layer.provide(downloadWorkflowLayer));
const backgroundSearchSharedLayer = BackgroundSearchSharedLive;
const searchReleaseLayer = SearchReleaseServiceLive;
const searchEpisodeLayer = SearchEpisodeServiceLive.pipe(Layer.provide(searchReleaseLayer));
const searchUnmappedLayer = SearchUnmappedServiceLive.pipe(
  Layer.provide(unmappedScanCoordinatorLayer),
);
const searchBackgroundMissingLayer = SearchBackgroundMissingServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      backgroundSearchSharedLayer,
      downloadTriggerCoordinatorLayer,
      operationsProgressLayer,
      searchReleaseLayer,
    ),
  ),
);
const searchBackgroundRssLayer = SearchBackgroundRssServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      backgroundSearchSharedLayer,
      downloadTriggerCoordinatorLayer,
      operationsProgressLayer,
    ),
  ),
);
const catalogDownloadLayer = CatalogDownloadServiceLive.pipe(
  Layer.provide(Layer.mergeAll(downloadWorkflowLayer, operationsProgressLayer)),
);
const catalogLibraryScanLayer = CatalogLibraryScanServiceLive.pipe(
  Layer.provide(operationsProgressLayer),
);

export const OperationsFeatureLive = Layer.mergeAll(
  downloadTriggerCoordinatorLayer,
  unmappedScanCoordinatorLayer,
  backgroundSearchSharedLayer,
  downloadReconciliationLayer,
  downloadTorrentLifecycleLayer,
  downloadProgressSupportLayer,
  downloadTriggerLayer,
  downloadWorkflowLayer,
  operationsProgressLayer,
  DownloadProgressServiceLive,
  catalogDownloadLayer,
  CatalogLibraryReadServiceLive,
  CatalogLibraryWriteServiceLive,
  catalogLibraryScanLayer,
  searchReleaseLayer,
  searchEpisodeLayer,
  SearchImportPathServiceLive,
  searchUnmappedLayer,
  searchBackgroundMissingLayer,
  searchBackgroundRssLayer,
);
