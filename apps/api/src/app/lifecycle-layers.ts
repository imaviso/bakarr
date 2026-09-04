import * as CommandExecutor from "effect/unstable/process/ChildProcessSpawner";
import { Layer } from "effect";

import {
  makeAppExternalClientLayer,
  type AppExternalClientLayerOptions,
} from "@/app/platform/external-clients-layer.ts";
import {
  makeAppPlatformCoreRuntimeLayer,
  type AppPlatformRuntimeOptions,
} from "@/app/platform/runtime-core.ts";
import { PureDbLeaves } from "@/app/pure-db-leaves.ts";
import { DatabaseSqlClientLive } from "@/db/database.ts";
import type { AppConfigOverrides, BootstrapConfigOverrides } from "@/app/config/schema.ts";
import type { ObservabilityConfigOverrides } from "@/app/config/observability.ts";
import { BackgroundWorkerControllerLive } from "@/background/controller-core.ts";
import { BackgroundJobRunnerLive } from "@/background/background-job-runner.ts";
import { BackgroundTaskRunnerLive } from "@/background/task-runner.ts";
import { BackgroundWorkerTimeoutsLive } from "@/background/worker-timeouts.ts";
import { AuthBootstrapServiceLive } from "@/features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "@/features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "@/features/auth/session-service.ts";
import { MediaEnrollmentServiceLive } from "@/features/media/add/media-enrollment-service.ts";
import { MediaFileServiceLive } from "@/features/media/files/media-file-service.ts";
import { MediaImageCacheServiceLive } from "@/features/media/metadata/media-image-cache-service.ts";
import { MediaMaintenanceServiceLive } from "@/features/media/metadata/media-maintenance-service.ts";
import { MediaMetadataEnrichmentServiceLive } from "@/features/media/metadata/media-metadata-enrichment-service.ts";
import { MediaMetadataProviderServiceLive } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { MediaSeasonalProviderServiceLive } from "@/features/media/query/media-seasonal-provider-service.ts";
import { MediaQueryServiceLive } from "@/features/media/query/query-service.ts";
import { MediaReaderServiceLive } from "@/features/media/reader/media-reader-service.ts";
import { MediaSettingsServiceLive } from "@/features/media/shared/media-settings-service.ts";
import { MediaStreamServiceLive } from "@/features/media/stream/media-stream-service.ts";
import { StreamTokenSignerLive } from "@/features/media/stream/stream-token-signer.ts";
import { SearchBackgroundMissingServiceLive } from "@/features/operations/background-search/background-search-missing-service.ts";
import { BackgroundSearchQueueServiceLive } from "@/features/operations/background-search/background-search-queue-service.ts";
import { BackgroundSearchRssFeedServiceLive } from "@/features/operations/background-search/background-search-rss-feed-service.ts";
import { SearchBackgroundRssServiceLive } from "@/features/operations/background-search/background-search-rss-service.ts";
import { BackgroundSearchRssWorkerServiceLive } from "@/features/operations/background-search/background-search-rss-worker-service.ts";
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
import { SearchReleaseServiceLive } from "@/features/operations/search/search-orchestration-release-search.ts";
import { SearchUnitServiceLive } from "@/features/operations/search/search-unit-service.ts";
import { OperationsTaskLauncherServiceLive } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import {
  OperationsTaskReadServiceLive,
  OperationsTaskWriteServiceLive,
} from "@/features/operations/tasks/operations-task-service.ts";
import {
  DownloadTriggerGateLive,
  UnmappedScanCoordinatorLive,
} from "@/features/operations/tasks/task-coordinators.ts";
import { UnmappedControlServiceLive } from "@/features/operations/unmapped/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped/unmapped-orchestration-import.ts";
import { UnmappedScanServiceLive } from "@/features/operations/unmapped/unmapped-scan-service.ts";
import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";
import { QualityProfileServiceLive } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "@/features/system/release-profile-service.ts";
import { SystemBootstrapServiceLive } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { SystemConfigUpdateServiceLive } from "@/features/system/system-config-update-service.ts";
import { SystemEventsServiceLive } from "@/features/system/system-events-service.ts";
import { SystemLogServiceLive } from "@/features/system/system-log-service.ts";
import { SystemReadServiceLive } from "@/features/system/system-read-service.ts";
import { SystemRuntimeMetricsServiceLive } from "@/features/system/system-runtime-metrics-service.ts";
import { OperationsProgressLive } from "@/features/operations/tasks/operations-progress-service.ts";
import { TorrentClientServiceLive } from "@/features/operations/torrent/torrent-client-service.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { RuntimeConfigSnapshotServiceLive } from "@/features/system/runtime-config-snapshot-service.ts";
import { MediaProbeLive } from "@/infra/media/probe.ts";

export type ApiLifecycleOptions = AppPlatformRuntimeOptions &
  AppExternalClientLayerOptions & {
    readonly commandExecutorLayer?: Layer.Layer<CommandExecutor.ChildProcessSpawner>;
  };

/**
 * Application layer assembly: one flat, topologically sorted staircase.
 *
 * Service modules export `layer = Layer.effect(X, ...)` with direct yields
 * only — never `.pipe(Layer.provide(...))`. Each stage below merges
 * independent layers and provides the merged context of every stage beneath
 * it, so `provide` discharges requirements exactly and `appLayer` closes to
 * `R = never`:
 *
 * base (platform, clients, repos, config snapshot, progress/torrent/job
 * singletons) -> feature L0 -> L1 -> L2 -> L3 -> L4 -> task runner ->
 * worker controller.
 */
export function makeApiLifecycleLayers(
  overrides: AppConfigOverrides & BootstrapConfigOverrides & ObservabilityConfigOverrides = {},
  options?: ApiLifecycleOptions,
) {
  const platformCoreLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const platformRuntimeLayer = options?.commandExecutorLayer
    ? Layer.mergeAll(platformCoreLayer, options.commandExecutorLayer)
    : platformCoreLayer;

  const platformExternalLayer = platformRuntimeLayer;
  const infrastructureLayer = Layer.mergeAll(MediaProbeLive, DiskSpaceInspectorLive).pipe(
    Layer.provide(platformExternalLayer),
  );
  const runtimeSupportLayer = Layer.mergeAll(platformExternalLayer, infrastructureLayer);

  const pureDbLeaves = PureDbLeaves.pipe(
    Layer.provide(
      Layer.mergeAll(
        runtimeSupportLayer,
        DatabaseSqlClientLive.pipe(Layer.provide(runtimeSupportLayer)),
      ),
    ),
  );

  const systemConfigServiceLayer = SystemConfigServiceLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeSupportLayer, pureDbLeaves)),
  );
  const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeSupportLayer, systemConfigServiceLayer)),
  );
  const configRuntimeLayer = Layer.mergeAll(platformRuntimeLayer, runtimeConfigSnapshotLayer);

  const externalClientLayer = makeAppExternalClientLayer(options).pipe(
    Layer.provide(configRuntimeLayer),
  );

  const runtimeSupportWithClientsLayer = Layer.mergeAll(
    runtimeSupportLayer,
    externalClientLayer,
    runtimeConfigSnapshotLayer,
  );

  const operationsProgressLayer = OperationsProgressLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeSupportWithClientsLayer, pureDbLeaves)),
  );
  const torrentClientLayer = TorrentClientServiceLive.pipe(
    Layer.provide(runtimeSupportWithClientsLayer),
  );
  const backgroundTimeoutsLayer = BackgroundWorkerTimeoutsLive.pipe(
    Layer.provide(runtimeSupportWithClientsLayer),
  );
  const backgroundJobRunnerLayer = BackgroundJobRunnerLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeSupportWithClientsLayer, pureDbLeaves)),
  );

  const baseLayer = Layer.mergeAll(
    runtimeSupportWithClientsLayer,
    DatabaseSqlClientLive.pipe(Layer.provide(runtimeSupportLayer)),
    pureDbLeaves,
    systemConfigServiceLayer,
    runtimeConfigSnapshotLayer,
    operationsProgressLayer,
    torrentClientLayer,
    backgroundTimeoutsLayer,
    backgroundJobRunnerLayer,
  );

  const featureStage0Layer = Layer.mergeAll(
    AuthBootstrapServiceLive,
    AuthCredentialServiceLive,
    AuthSessionServiceLive,
    BackgroundJobStatusServiceLive,
    CatalogDownloadReadServiceLive,
    CatalogLibraryReadServiceLive,
    CatalogLibraryScanServiceLive,
    CatalogRssServiceLive,
    DownloadReconciliationServiceLive,
    DownloadTorrentActionServiceLive,
    DownloadTriggerGateLive,
    ImageAssetServiceLive,
    ImportPathScanServiceLive,
    LibraryBrowseServiceLive,
    MediaImageCacheServiceLive,
    MediaMetadataEnrichmentServiceLive,
    MediaReaderServiceLive,
    MediaSeasonalProviderServiceLive,
    MediaSettingsServiceLive,
    OperationsTaskReadServiceLive,
    OperationsTaskWriteServiceLive,
    QualityProfileServiceLive,
    ReleaseProfileServiceLive,
    SearchReleaseServiceLive,
    StreamTokenSignerLive,
    SystemBootstrapServiceLive,
    SystemConfigServiceLive,
    SystemEventsServiceLive,
    SystemLogServiceLive,
    UnmappedImportServiceLive,
    UnmappedScanCoordinatorLive,
  ).pipe(Layer.provide(baseLayer));

  // Each stage chains via provideMerge: the new layer's services PLUS the whole
  // previous context stay in the output. Using mergeAll(prev, next|provide(prev))
  // instead would hand the SAME layer object two roles (merge member and
  // provide-target) — a v4 memoization blowup that duplicates the entire stage
  // graph (2.3GB at build) and hangs on repeated runtime builds.
  const stage0Layer = featureStage0Layer.pipe(Layer.provideMerge(baseLayer));

  const featureStage1Layer = Layer.mergeAll(
    BackgroundSearchQueueServiceLive,
    DownloadTriggerServiceLive,
    MediaMetadataProviderServiceLive,
    MediaQueryServiceLive,
    MediaStreamServiceLive,
    OperationsTaskLauncherServiceLive,
    SearchUnitServiceLive,
    SystemReadServiceLive,
  );

  const stage1Layer = featureStage1Layer.pipe(Layer.provideMerge(stage0Layer));

  const featureStage2Layer = Layer.mergeAll(
    BackgroundSearchRssFeedServiceLive,
    CatalogLibraryWriteServiceLive,
    DownloadTorrentSyncServiceLive,
    MediaFileServiceLive,
    MediaMaintenanceServiceLive,
    SearchBackgroundMissingServiceLive,
    SystemRuntimeMetricsServiceLive,
    UnmappedScanServiceLive,
  );

  const stage2Layer = featureStage2Layer.pipe(Layer.provideMerge(stage1Layer));

  const featureStage3Layer = Layer.mergeAll(
    MediaEnrollmentServiceLive,
    SearchBackgroundRssServiceLive,
    UnmappedControlServiceLive,
  );

  const stage3Layer = featureStage3Layer.pipe(Layer.provideMerge(stage2Layer));

  const stage4Layer = BackgroundSearchRssWorkerServiceLive.pipe(Layer.provideMerge(stage3Layer));

  const stage5Layer = BackgroundTaskRunnerLive.pipe(Layer.provideMerge(stage4Layer));

  const stage6Layer = BackgroundWorkerControllerLive.pipe(Layer.provideMerge(stage5Layer));

  // Leaf: only HTTP routes consume it, and it reloads workers through the
  // controller — so it sits above the controller, outside the cycle.
  // provideMerge keeps the stage6 services in the output context (routes need
  // them) while adding the update service. A mergeAll(stage6, update|provide(stage6))
  // shape is a known v4 memoization blowup on repeated runtime builds.
  const appLayer = SystemConfigUpdateServiceLive.pipe(Layer.provideMerge(stage6Layer));

  return {
    appLayer,
  };
}
