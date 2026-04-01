import { Layer } from "effect";

import { BackgroundWorkerControllerLive } from "@/background-controller-live.ts";
import { BackgroundWorkerJobsLive } from "@/background-worker-jobs.ts";
import { makeAppPlatformCoreRuntimeLayer } from "@/app-platform-runtime-core.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { MediaProbeLive } from "@/lib/media-probe.ts";
import { AnimeFeatureLive } from "@/features/anime/anime-feature-layer.ts";
import { AnimeEnrollmentServiceLive } from "@/features/anime/anime-enrollment-service.ts";
import { AuthBootstrapServiceLive } from "@/features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "@/features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "@/features/auth/session-service.ts";
import { LibraryBrowseServiceLive } from "@/features/operations/library-browse-service.ts";
import { OperationsFeatureLive } from "@/features/operations/operations-feature-layer.ts";
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

const withProvidedLayer =
  <P, PE, PR>(provided: Layer.Layer<P, PE, PR>) =>
  <A, E, R>(layer: Layer.Layer<A, E, R>) =>
    layer.pipe(Layer.provideMerge(provided));

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

  const withPlatform = withProvidedLayer(platformLayer);

  const animeLayer = withPlatform(AnimeFeatureLive);
  const operationsLayer = withPlatform(OperationsFeatureLive);
  const backgroundWorkerJobsLayer = BackgroundWorkerJobsLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, operationsLayer, animeLayer)),
  );

  // Background controller (scoped, depends on platform + operations + anime)
  const backgroundControllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, backgroundWorkerJobsLayer)),
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
  const libraryBrowseLayer = LibraryBrowseServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, operationsLayer, systemLayer)),
  );
  const libraryLayer = Layer.mergeAll(libraryBrowseLayer);

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
