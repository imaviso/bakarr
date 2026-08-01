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
import { DownloadReconciliationServiceLive } from "@/features/operations/download/download-reconciliation-service.ts";
import { DownloadTorrentActionServiceLive } from "@/features/operations/download/download-torrent-action-service.ts";
import { DownloadTorrentSyncServiceLive } from "@/features/operations/download/download-torrent-sync-service.ts";
import { DownloadTriggerServiceLive } from "@/features/operations/download/download-trigger-service.ts";
import { ImportPathScanServiceLive } from "@/features/operations/import-scan/import-path-scan-service.ts";
import { LibraryBrowseServiceLive } from "@/features/operations/library/library-browse-service.ts";
import {
  OperationsTaskReadServiceLive,
  OperationsTaskWriteServiceLive,
} from "@/features/operations/tasks/operations-task-service.ts";
import {
  DownloadTriggerGateLive,
  UnmappedScanCoordinatorLive,
} from "@/features/operations/tasks/task-coordinators.ts";
import { SearchUnitServiceLive } from "@/features/operations/search/search-unit-service.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search/search-orchestration-release-search.ts";
import { UnmappedControlServiceLive } from "@/features/operations/unmapped/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped/unmapped-orchestration-import.ts";
import { UnmappedScanServiceLive } from "@/features/operations/unmapped/unmapped-scan-service.ts";
import { OperationsTaskLauncherServiceLive } from "@/features/operations/tasks/operations-task-launcher-service.ts";

/**
 * Operations feature root.
 *
 * Declarative merge of self-contained `Effect.Service` Defaults: each service
 * declares its domain dependencies in its own `dependencies:` array, so no
 * per-service `Layer.provide` chains live here. Residual context requirements
 * (external clients, platform/config tags, and the stateful singletons
 * RuntimeConfigSnapshotService, TorrentClientService + OperationsProgress) are
 * covered once by the lifecycle layer's single `Layer.provide` over the merged
 * feature graph — see app/lifecycle-layers.ts.
 *
 * DownloadTriggerGate (semaphore) and UnmappedScanCoordinator (scoped lease)
 * are stateful coordination singletons. They are merged as the canonical
 * `.Default` objects — the same objects embedded in their consumers'
 * `dependencies:` — so the layer memo map builds exactly one instance of each.
 */
export const OperationsFeatureLayer = Layer.mergeAll(
  DownloadTriggerGateLive,
  UnmappedScanCoordinatorLive,
  BackgroundSearchQueueServiceLive,
  BackgroundSearchRssFeedServiceLive,
  BackgroundSearchRssWorkerServiceLive,
  SearchBackgroundMissingServiceLive,
  SearchBackgroundRssServiceLive,
  CatalogDownloadReadServiceLive,
  CatalogLibraryReadServiceLive,
  CatalogLibraryScanServiceLive,
  CatalogLibraryWriteServiceLive,
  CatalogRssServiceLive,
  DownloadReconciliationServiceLive,
  DownloadTorrentActionServiceLive,
  DownloadTorrentSyncServiceLive,
  DownloadTriggerServiceLive,
  ImportPathScanServiceLive,
  LibraryBrowseServiceLive,
  OperationsTaskReadServiceLive,
  OperationsTaskWriteServiceLive,
  OperationsTaskLauncherServiceLive,
  SearchUnitServiceLive,
  SearchReleaseServiceLive,
  UnmappedControlServiceLive,
  UnmappedImportServiceLive,
  UnmappedScanServiceLive,
);
