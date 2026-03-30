import { Layer } from "effect";

import { BackgroundWorkerControllerLive } from "@/background-controller-live.ts";
import { makeAppPlatformCoreRuntimeLayer } from "@/app-platform-runtime-core.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { MediaProbeLive } from "@/lib/media-probe.ts";
import { AnimeEnrollmentServiceLive } from "@/features/anime/anime-enrollment-service.ts";
import { AnimeFileServiceLive } from "@/features/anime/file-service.ts";
import { AnimeImportServiceLive } from "@/features/anime/import-service.ts";
import { AnimeMutationServiceLive } from "@/features/anime/mutation-service.ts";
import { AnimeQueryServiceLive } from "@/features/anime/query-service.ts";
import { AuthBootstrapServiceLive } from "@/features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "@/features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "@/features/auth/session-service.ts";
import { LibraryBrowseServiceLive } from "@/features/operations/library-browse-service.ts";
import { LibraryRootsServiceLive } from "@/features/library-roots/service.ts";
import { CatalogDownloadServiceLive } from "@/features/operations/catalog-service-tags.ts";
import { CatalogLibraryServiceLive } from "@/features/operations/catalog-library-service.ts";
import {
  DownloadProgressServiceLive,
  DownloadWorkflowLive,
  ProgressLive,
} from "@/features/operations/download-service-tags.ts";
import { SearchBackgroundServiceLive } from "@/features/operations/search-background-service.ts";
import { SearchEpisodeServiceLive } from "@/features/operations/search-episode-service.ts";
import { SearchImportPathServiceLive } from "@/features/operations/search-import-path-service.ts";
import { SearchReleaseServiceLive } from "@/features/operations/search-release-service.ts";
import { SearchUnmappedServiceLive } from "@/features/operations/search-unmapped-service.ts";
import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";
import { MetricsServiceLive } from "@/features/system/metrics-service.ts";
import { QualityProfileServiceLive } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "@/features/system/release-profile-service.ts";
import { SystemBootstrapServiceLive } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigUpdateServiceLive } from "@/features/system/system-config-update-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { SystemDashboardServiceLive } from "@/features/system/system-dashboard-service.ts";
import { SystemLogServiceLive } from "@/features/system/system-log-service.ts";
import { SystemStatusServiceLive } from "@/features/system/system-status-service.ts";
import type { AppConfigShape } from "@/config.ts";
import type { AppPlatformRuntimeOptions } from "@/app-platform-runtime-core.ts";

/**
 * Build the complete application layer graph.
 *
 * All layers are composed at this single boundary. Following EFFECT_GUIDE.md:
 * - Platform dependencies are provided consistently throughout
 * - Inter-service dependencies are wired explicitly
 * - The final appLayer has no remaining requirements (R = never)
 */
export function makeApiLifecycleLayers(
  overrides: Partial<AppConfigShape> = {},
  options?: AppPlatformRuntimeOptions,
) {
  // Platform layer: clock, config, database, HTTP clients, media probe, disk space, etc.
  const platformBaseLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const commandLayer = options?.commandExecutorLayer;
  const platformWithCommandLayer = commandLayer
    ? Layer.mergeAll(platformBaseLayer, commandLayer)
    : platformBaseLayer;
  const infrastructureLayer = Layer.mergeAll(MediaProbeLive, DiskSpaceInspectorLive).pipe(
    Layer.provideMerge(platformWithCommandLayer),
  );
  const platformLayer = Layer.mergeAll(platformWithCommandLayer, infrastructureLayer);

  // Helper: provide platform to a layer
  const withPlatform = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
    layer.pipe(Layer.provideMerge(platformLayer));

  // Anime services (platform-only dependencies)
  const animeLayer = Layer.mergeAll(
    withPlatform(AnimeQueryServiceLive),
    withPlatform(AnimeMutationServiceLive),
    withPlatform(AnimeFileServiceLive),
    withPlatform(AnimeImportServiceLive),
  );

  // Download workflow and progress (interdependent)
  const downloadWorkflowLayer = withPlatform(DownloadWorkflowLive);
  const progressLayer = withPlatform(ProgressLive.pipe(Layer.provideMerge(downloadWorkflowLayer)));
  const downloadBaseLayer = Layer.mergeAll(downloadWorkflowLayer, progressLayer);

  // Catalog services (depend on download base)
  const catalogLayer = Layer.mergeAll(
    withPlatform(CatalogDownloadServiceLive.pipe(Layer.provideMerge(downloadBaseLayer))),
    withPlatform(CatalogLibraryServiceLive.pipe(Layer.provideMerge(downloadBaseLayer))),
  );

  // Search services (direct leaf capabilities)
  const searchReleaseLayer = withPlatform(SearchReleaseServiceLive);
  const searchEpisodeLayer = withPlatform(
    SearchEpisodeServiceLive.pipe(Layer.provideMerge(searchReleaseLayer)),
  );
  const searchImportPathLayer = withPlatform(SearchImportPathServiceLive);
  const searchUnmappedLayer = withPlatform(
    SearchUnmappedServiceLive.pipe(
      Layer.provideMerge(Layer.mergeAll(downloadBaseLayer, animeLayer)),
    ),
  );
  const searchBackgroundLayer = withPlatform(
    SearchBackgroundServiceLive.pipe(
      Layer.provideMerge(Layer.mergeAll(downloadBaseLayer, searchReleaseLayer)),
    ),
  );
  const searchLayer = Layer.mergeAll(
    searchReleaseLayer,
    searchEpisodeLayer,
    searchImportPathLayer,
    searchUnmappedLayer,
    searchBackgroundLayer,
  );

  // Operations feature (all download/catalog/search services)
  const operationsLayer = Layer.mergeAll(
    downloadBaseLayer,
    withPlatform(DownloadProgressServiceLive),
    catalogLayer,
    searchLayer,
  );

  // Background controller (scoped, depends on platform + operations + anime)
  const backgroundControllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, operationsLayer, animeLayer)),
  );

  // Auth services (platform-only dependencies)
  const authLayer = Layer.mergeAll(
    withPlatform(AuthBootstrapServiceLive),
    withPlatform(AuthCredentialServiceLive),
    withPlatform(AuthSessionServiceLive),
  );

  // System config and background status (interdependent)
  const systemConfigLayer = withPlatform(SystemConfigServiceLive);
  const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, systemConfigLayer)),
  );
  const systemBaseLayer = Layer.mergeAll(systemConfigLayer, backgroundJobStatusLayer);

  // System status and dashboard (depend on system base)
  const systemStatusLayer = SystemStatusServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, systemBaseLayer)),
  );
  const systemDashboardLayer = SystemDashboardServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, systemBaseLayer)),
  );

  // System config update (depends on background controller)
  const systemConfigUpdateLayer = SystemConfigUpdateServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, backgroundControllerLayer)),
  );

  // Metrics (depends on operations + system status)
  const metricsLayer = MetricsServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, operationsLayer, systemStatusLayer)),
  );

  // Image assets (depends on system config)
  const imageAssetLayer = ImageAssetServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, systemConfigLayer)),
  );

  // System feature (all system services)
  const systemLayer = Layer.mergeAll(
    withPlatform(SystemBootstrapServiceLive),
    systemBaseLayer,
    systemConfigUpdateLayer,
    systemStatusLayer,
    systemDashboardLayer,
    withPlatform(QualityProfileServiceLive),
    withPlatform(ReleaseProfileServiceLive),
    withPlatform(SystemLogServiceLive),
    metricsLayer,
    imageAssetLayer,
  );

  // Library services (platform + operations + system dependencies)
  const libraryRootsLayer = withPlatform(LibraryRootsServiceLive);
  const libraryBrowseLayer = LibraryBrowseServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(platformLayer, operationsLayer, systemLayer, libraryRootsLayer),
    ),
  );
  const libraryLayer = Layer.mergeAll(libraryRootsLayer, libraryBrowseLayer);

  // Anime enrollment (depends on platform + operations + anime)
  const animeEnrollmentLayer = AnimeEnrollmentServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, operationsLayer, animeLayer)),
  );

  // Complete application layer - all features merged
  const appLayer = Layer.mergeAll(
    operationsLayer,
    animeLayer,
    backgroundControllerLayer,
    authLayer,
    systemLayer,
    libraryLayer,
    animeEnrollmentLayer,
  );

  return {
    appLayer,
    platformLayer,
  } as const;
}

export type ApiLifecycleLayers = ReturnType<typeof makeApiLifecycleLayers>;
