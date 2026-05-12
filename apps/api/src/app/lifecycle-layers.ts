import { CommandExecutor } from "@effect/platform";
import { Layer } from "effect";

import {
  makeAppExternalClientLayer,
  type AppExternalClientLayerOptions,
} from "@/app/platform/external-clients-layer.ts";
import {
  makeAppPlatformCoreRuntimeLayer,
  type AppPlatformRuntimeOptions,
} from "@/app/platform/runtime-core.ts";
import type { AppConfigOverrides, BootstrapConfigOverrides } from "@/config/schema.ts";
import { BackgroundWorkerControllerLive } from "@/background/controller-core.ts";
import { BackgroundTaskRunnerLive } from "@/background/task-runner.ts";
import { AnimeFileServiceLive } from "@/features/anime/anime-file-service.ts";
import { AnimeImageCacheServiceLive } from "@/features/anime/anime-image-cache-service.ts";
import { AnimeEnrollmentServiceLive } from "@/features/anime/anime-enrollment-service.ts";
import { AnimeMaintenanceServiceLive } from "@/features/anime/anime-maintenance-service.ts";
import { AnimeMetadataEnrichmentServiceLive } from "@/features/anime/anime-metadata-enrichment-service.ts";
import { AnimeMetadataProviderServiceLive } from "@/features/anime/anime-metadata-provider-service.ts";
import { AnimeSeasonalProviderServiceLive } from "@/features/anime/anime-seasonal-provider-service.ts";
import { AnimeSettingsServiceLive } from "@/features/anime/anime-settings-service.ts";
import { AnimeStreamServiceLive } from "@/features/anime/anime-stream-service.ts";
import { AnimeQueryServiceLive } from "@/features/anime/query-service.ts";
import { StreamTokenSignerLive } from "@/features/anime/stream-token-signer.ts";
import { AuthBootstrapServiceLive } from "@/features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "@/features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "@/features/auth/session-service.ts";
import { BackgroundSearchQueueServiceLive } from "@/features/operations/background-search-queue-service.ts";
import { BackgroundSearchRssFeedServiceLive } from "@/features/operations/background-search-rss-feed-service.ts";
import { BackgroundSearchRssWorkerServiceLive } from "@/features/operations/background-search-rss-worker-service.ts";
import { SearchBackgroundMissingServiceLive } from "@/features/operations/background-search-missing-support.ts";
import { SearchBackgroundRssServiceLive } from "@/features/operations/background-search-rss-support.ts";
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
import { LibraryBrowseServiceLive } from "@/features/operations/library-browse-service.ts";
import { LibraryRootsQueryServiceLive } from "@/features/operations/library-roots-query-service.ts";
import { ProgressLive } from "@/features/operations/operations-progress-service.ts";
import { OperationsTaskLauncherServiceLive } from "@/features/operations/operations-task-launcher-service.ts";
import {
  OperationsTaskReadServiceLive,
  OperationsTaskWriteServiceLive,
} from "@/features/operations/operations-task-service.ts";
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
import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { RuntimeConfigSnapshotServiceLive } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";
import { QualityProfileServiceLive } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "@/features/system/release-profile-service.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { SystemBootstrapServiceLive } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigUpdateServiceLive } from "@/features/system/system-config-update-service.ts";
import { SystemEventsServiceLive } from "@/features/system/system-events-service.ts";
import { SystemLogServiceLive } from "@/features/system/system-log-service.ts";
import { SystemReadServiceLive } from "@/features/system/system-read-service.ts";
import { SystemRuntimeMetricsServiceLive } from "@/features/system/system-runtime-metrics-service.ts";
import { MediaProbeLive } from "@/infra/media/probe.ts";

export type ApiLifecycleOptions = AppPlatformRuntimeOptions &
  AppExternalClientLayerOptions & {
    readonly commandExecutorLayer?: Layer.Layer<CommandExecutor.CommandExecutor>;
  };

export function makeApiLifecycleLayers(
  overrides: AppConfigOverrides & BootstrapConfigOverrides = {},
  options?: ApiLifecycleOptions,
) {
  // Platform core: config, database, runtime primitives, logging.
  const platformCoreLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const platformRuntimeLayer = options?.commandExecutorLayer
    ? Layer.mergeAll(platformCoreLayer, options.commandExecutorLayer)
    : platformCoreLayer;

  // Runtime config graph: system config -> validated runtime snapshot.
  const systemConfigLayer = SystemConfigServiceLive.pipe(Layer.provide(platformRuntimeLayer));
  const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
    Layer.provide(systemConfigLayer),
  );
  const configRuntimeLayer = Layer.mergeAll(platformRuntimeLayer, runtimeConfigSnapshotLayer);

  // External clients depend on runtime config + platform runtime.
  const externalClientLayer = makeAppExternalClientLayer(options).pipe(
    Layer.provide(configRuntimeLayer),
  );

  // Infrastructure layer adds command-backed probing services.
  const platformExternalLayer = Layer.mergeAll(platformRuntimeLayer, externalClientLayer);
  const infrastructureLayer = Layer.mergeAll(MediaProbeLive, DiskSpaceInspectorLive).pipe(
    Layer.provide(platformExternalLayer),
  );
  const platformLayer = Layer.mergeAll(platformExternalLayer, infrastructureLayer);
  const runtimeSupportLayer = Layer.mergeAll(
    platformLayer,
    systemConfigLayer,
    runtimeConfigSnapshotLayer,
  );

  // Anime features.
  const animeImageCacheLayer = AnimeImageCacheServiceLive;
  const animeMetadataEnrichmentLayer = AnimeMetadataEnrichmentServiceLive;
  const animeMetadataProviderLayer = AnimeMetadataProviderServiceLive.pipe(
    Layer.provide(animeMetadataEnrichmentLayer),
  );
  const animeMaintenanceLayer = AnimeMaintenanceServiceLive.pipe(
    Layer.provide(Layer.mergeAll(animeMetadataProviderLayer, animeImageCacheLayer)),
  );
  const animeStreamTokenSignerLayer = StreamTokenSignerLive;
  const animeStreamLayer = AnimeStreamServiceLive.pipe(Layer.provide(animeStreamTokenSignerLayer));
  const animeSeasonalProviderLayer = AnimeSeasonalProviderServiceLive;
  const animeLiveLayer = Layer.mergeAll(
    animeImageCacheLayer,
    AnimeQueryServiceLive,
    AnimeFileServiceLive,
    animeMaintenanceLayer,
    animeMetadataEnrichmentLayer,
    animeMetadataProviderLayer,
    AnimeSettingsServiceLive,
    animeStreamTokenSignerLayer,
    animeStreamLayer,
  ).pipe(Layer.provideMerge(animeSeasonalProviderLayer), Layer.provide(runtimeSupportLayer));

  // Operations download/runtime features.
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
  const downloadLifecycleRuntimeLayer = Layer.mergeAll(
    downloadRuntimeLayer,
    downloadReconciliationLayer,
  );
  const downloadTorrentLifecycleLayer = DownloadTorrentLifecycleServiceLive.pipe(
    Layer.provide(downloadLifecycleRuntimeLayer),
  );
  const downloadProgressRuntimeLayer = Layer.mergeAll(
    downloadLifecycleRuntimeLayer,
    downloadTorrentLifecycleLayer,
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

  // Operations search, catalog, and unmapped features.
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
  const appDomainSubgraphLayer = Layer.mergeAll(animeLiveLayer, operationsLayer);

  // Background worker runtime sits on top of domain + runtime support.
  const backgroundTaskRunnerLayer = BackgroundTaskRunnerLive.pipe(
    Layer.provide(Layer.mergeAll(appDomainSubgraphLayer, runtimeSupportLayer)),
  );
  const backgroundControllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provide(Layer.mergeAll(backgroundTaskRunnerLayer, runtimeSupportLayer)),
  );
  const runtimeWorkerSubgraphLayer = Layer.mergeAll(
    backgroundTaskRunnerLayer,
    backgroundControllerLayer,
  );

  // System + auth + orchestration features.
  const runtimeWithBackgroundControllerLayer = Layer.mergeAll(
    runtimeSupportLayer,
    backgroundControllerLayer,
  );
  const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
    Layer.provide(runtimeWithBackgroundControllerLayer),
  );
  const runtimeWithBackgroundJobStatusLayer = Layer.mergeAll(
    runtimeSupportLayer,
    backgroundJobStatusLayer,
  );
  const systemReadLayer = SystemReadServiceLive.pipe(
    Layer.provide(runtimeWithBackgroundJobStatusLayer),
  );
  const systemRuntimeMetricsLayer = SystemRuntimeMetricsServiceLive.pipe(
    Layer.provide(systemReadLayer),
  );
  const systemLayer = Layer.mergeAll(
    SystemBootstrapServiceLive.pipe(Layer.provide(runtimeSupportLayer)),
    ImageAssetServiceLive.pipe(Layer.provide(runtimeSupportLayer)),
    QualityProfileServiceLive.pipe(Layer.provide(runtimeSupportLayer)),
    ReleaseProfileServiceLive.pipe(Layer.provide(runtimeSupportLayer)),
    SystemLogServiceLive.pipe(Layer.provide(runtimeSupportLayer)),
    backgroundJobStatusLayer,
    systemReadLayer,
    systemRuntimeMetricsLayer,
    SystemConfigUpdateServiceLive.pipe(Layer.provide(runtimeWithBackgroundControllerLayer)),
    SystemEventsServiceLive.pipe(
      Layer.provide(Layer.mergeAll(runtimeSupportLayer, catalogDownloadReadLayer)),
    ),
  );

  const authLayer = Layer.mergeAll(
    AuthBootstrapServiceLive,
    AuthCredentialServiceLive,
    AuthSessionServiceLive,
  ).pipe(Layer.provide(runtimeSupportLayer));

  const operationsTaskLauncherLayer = OperationsTaskLauncherServiceLive.pipe(
    Layer.provide(operationsTaskWriteLayer),
  );
  const libraryLayer = LibraryBrowseServiceLive.pipe(
    Layer.provide(Layer.mergeAll(systemLayer, operationsLayer)),
  );
  const animeEnrollmentLayer = AnimeEnrollmentServiceLive.pipe(
    Layer.provide(Layer.mergeAll(animeLiveLayer, operationsLayer, operationsTaskLauncherLayer)),
  );

  const appFeatureBaseLayer = Layer.mergeAll(
    appDomainSubgraphLayer,
    runtimeWorkerSubgraphLayer,
    authLayer,
    systemLayer,
    libraryLayer,
    animeEnrollmentLayer,
    operationsTaskReadLayer,
    operationsTaskWriteLayer,
  );
  const appFeatureSubgraphLayer = Layer.mergeAll(appFeatureBaseLayer, operationsTaskLauncherLayer);
  const appLayer = Layer.mergeAll(
    runtimeSupportLayer,
    appFeatureSubgraphLayer.pipe(Layer.provide(runtimeSupportLayer)),
  );

  return {
    appLayer,
    operationsProgressLayer,
    platformLayer,
    torrentClientLayer,
  } as const;
}
