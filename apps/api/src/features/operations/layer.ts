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
import { SearchUnitServiceLive } from "@/features/operations/search/search-orchestration-unit-support.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search/search-orchestration-release-search.ts";
import { TorrentClientServiceLive } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { UnmappedControlServiceLive } from "@/features/operations/unmapped/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped/unmapped-orchestration-import.ts";
import { UnmappedScanServiceLive } from "@/features/operations/unmapped/unmapped-scan-service.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { DownloadActionRepository } from "@/features/operations/repository/download-action-repository.ts";
import { DownloadProgressRepository } from "@/features/operations/repository/download-progress-repository.ts";
import { DownloadReconciliationRepository } from "@/features/operations/repository/download-reconciliation-repository.ts";
import { DownloadSyncRepository } from "@/features/operations/repository/download-sync-repository.ts";
import { DownloadTriggerRepository } from "@/features/operations/repository/download-trigger-repository.ts";
import { LibraryRootsRepository } from "@/features/operations/repository/library-roots-repository.ts";
import { OperationsProfileRepository } from "@/features/operations/repository/profile-repository.ts";
import { OperationsTaskRepository } from "@/features/operations/repository/task-repository.ts";
import { SystemUnmappedRepository } from "@/features/system/repository/unmapped-repository.ts";

export function makeOperationsFeatureLayer<ROut, E, RIn>(
  runtimeSupportLayer: Layer.Layer<ROut, E, RIn>,
) {
  const operationsTaskRepositoryLayer = OperationsTaskRepository.DefaultWithoutDependencies.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const operationsTaskReadLayer = OperationsTaskReadServiceLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeSupportLayer, operationsTaskRepositoryLayer)),
  );
  const operationsTaskWriteLayer = OperationsTaskWriteServiceLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeSupportLayer, operationsTaskRepositoryLayer)),
  );
  const mediaReadRepositoryLayer = MediaReadRepository.DefaultWithoutDependencies.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const libraryRootsRepositoryLayer = LibraryRootsRepository.DefaultWithoutDependencies.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const operationsProfileRepositoryLayer =
    OperationsProfileRepository.DefaultWithoutDependencies.pipe(Layer.provide(runtimeSupportLayer));
  const systemUnmappedRepositoryLayer = SystemUnmappedRepository.DefaultWithoutDependencies.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const downloadProgressRepositoryLayer =
    DownloadProgressRepository.DefaultWithoutDependencies.pipe(Layer.provide(runtimeSupportLayer));
  const downloadActionRepositoryLayer = DownloadActionRepository.DefaultWithoutDependencies.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const downloadTriggerRepositoryLayer = DownloadTriggerRepository.DefaultWithoutDependencies.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const downloadSyncRepositoryLayer = DownloadSyncRepository.DefaultWithoutDependencies.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const downloadReconciliationRepositoryLayer =
    DownloadReconciliationRepository.DefaultWithoutDependencies.pipe(
      Layer.provide(runtimeSupportLayer),
    );
  const operationsRuntimeLayer = Layer.mergeAll(
    runtimeSupportLayer,
    operationsProfileRepositoryLayer,
    operationsTaskRepositoryLayer,
    systemUnmappedRepositoryLayer,
    DownloadTriggerCoordinatorLive,
    mediaReadRepositoryLayer,
    UnmappedScanCoordinatorLive,
  );
  const torrentClientLayer = TorrentClientServiceLive.pipe(Layer.provide(operationsRuntimeLayer));
  const downloadRuntimeLayer = Layer.mergeAll(operationsRuntimeLayer, torrentClientLayer);
  const downloadReconciliationLayer = DownloadReconciliationServiceLive.pipe(
    Layer.provide(Layer.mergeAll(downloadRuntimeLayer, downloadReconciliationRepositoryLayer)),
  );
  const downloadActionLayer = DownloadTorrentActionServiceLive.pipe(
    Layer.provide(Layer.mergeAll(downloadRuntimeLayer, downloadActionRepositoryLayer)),
  );
  const downloadSyncRuntimeLayer = Layer.mergeAll(
    downloadRuntimeLayer,
    downloadReconciliationLayer,
    downloadSyncRepositoryLayer,
  );
  const downloadSyncLayer = DownloadTorrentSyncServiceLive.pipe(
    Layer.provide(downloadSyncRuntimeLayer),
  );
  const downloadProgressRuntimeLayer = Layer.mergeAll(
    downloadSyncRuntimeLayer,
    downloadActionLayer,
    downloadSyncLayer,
    downloadProgressRepositoryLayer,
  );
  const downloadProgressSupportLayer = DownloadProgressSupportLive.pipe(
    Layer.provide(downloadProgressRuntimeLayer),
  );
  const triggerRuntimeLayer = Layer.mergeAll(
    downloadProgressRuntimeLayer,
    downloadProgressSupportLayer,
    downloadTriggerRepositoryLayer,
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
  const searchReleaseLayer = SearchReleaseServiceLive.pipe(Layer.provide(operationsRuntimeLayer));
  const runtimeWithReleaseLayer = Layer.mergeAll(runtimeSupportLayer, searchReleaseLayer);
  const searchUnitLayer = SearchUnitServiceLive.pipe(Layer.provide(runtimeWithReleaseLayer));
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
    Layer.provide(operationsRuntimeLayer),
  );
  const catalogLibraryWriteLayer = CatalogLibraryWriteServiceLive.pipe(
    Layer.provide(operationsRuntimeLayer),
  );
  const catalogLibraryScanLayer = CatalogLibraryScanServiceLive.pipe(
    Layer.provide(runtimeWithProgressLayer),
  );
  const importPathScanLayer = ImportPathScanServiceLive.pipe(Layer.provide(operationsRuntimeLayer));
  const catalogRssLayer = CatalogRssServiceLive.pipe(Layer.provide(operationsRuntimeLayer));
  const libraryRootsQueryLayer = LibraryRootsQueryServiceLive.pipe(
    Layer.provide(libraryRootsRepositoryLayer),
  );
  const unmappedScanLayer = UnmappedScanServiceLive.pipe(Layer.provide(operationsRuntimeLayer));
  const unmappedControlLayer = UnmappedControlServiceLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeSupportLayer, unmappedScanLayer)),
  );
  const unmappedImportLayer = UnmappedImportServiceLive.pipe(Layer.provide(operationsRuntimeLayer));
  const operationsLayer = Layer.mergeAll(
    torrentClientLayer,
    downloadReconciliationLayer,
    downloadActionLayer,
    downloadSyncLayer,
    downloadProgressSupportLayer,
    downloadTriggerLayer,
    catalogDownloadReadLayer,
    catalogDownloadCommandLayer,
    mediaReadRepositoryLayer,
    libraryRootsRepositoryLayer,
    operationsProfileRepositoryLayer,
    operationsTaskRepositoryLayer,
    systemUnmappedRepositoryLayer,
    downloadActionRepositoryLayer,
    downloadTriggerRepositoryLayer,
    downloadSyncRepositoryLayer,
    downloadReconciliationRepositoryLayer,
    downloadProgressRepositoryLayer,
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
