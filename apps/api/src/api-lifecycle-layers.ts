import { Layer } from "effect";

import { makeAppPlatformRuntimeLayer, type RuntimeOptions } from "./app-platform-runtime-layer.ts";
import { BackgroundWorkerControllerLive } from "./background-controller-live.ts";
import { AuthBootstrapServiceLive } from "./features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "./features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "./features/auth/session-service.ts";
import { makeAnimeRuntimeLayer } from "./features/anime/anime-runtime-layer.ts";
import { AnimeEnrollmentServiceLive } from "./features/anime/anime-enrollment-service.ts";
import { LibraryRootsServiceLive } from "./features/library-roots/service.ts";
import { LibraryBrowseServiceLive } from "./features/operations/library-browse-service.ts";
import { CatalogWorkflowLive } from "./features/operations/catalog-service-tags.ts";
import { CatalogLibraryReadSupportLive } from "./features/operations/catalog-library-read-support-service.ts";
import { DownloadWorkflowLive } from "./features/operations/download-service-tags.ts";
import { OperationsSharedStateLive } from "./features/operations/operations-shared-state.ts";
import { ProgressLive } from "./features/operations/operations-progress.ts";
import { SearchWorkflowLive } from "./features/operations/search-service-tags.ts";
import { MetricsServiceLive } from "./features/system/metrics-service.ts";
import { ImageAssetServiceLive } from "./features/system/image-asset-service.ts";
import { QualityProfileServiceLive } from "./features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "./features/system/release-profile-service.ts";
import { SystemBootstrapServiceLive } from "./features/system/system-bootstrap-service.ts";
import { SystemConfigUpdateServiceLive } from "./features/system/system-config-update-service.ts";
import { SystemConfigServiceLive } from "./features/system/system-config-service.ts";
import { SystemDashboardServiceLive } from "./features/system/system-dashboard-service.ts";
import { SystemLogServiceLive } from "./features/system/system-log-service.ts";
import { SystemStatusServiceLive } from "./features/system/system-status-service.ts";
import type { AppConfigShape } from "./config.ts";

export function makeApiLifecycleLayers(
  overrides: Partial<AppConfigShape> = {},
  options?: RuntimeOptions,
) {
  const platformLayer = makeAppPlatformRuntimeLayer(overrides, options);
  const animeLayer = makeAnimeRuntimeLayer(platformLayer);
  const sharedStateLayer = OperationsSharedStateLive;
  const downloadSupportLayer = Layer.mergeAll(platformLayer, sharedStateLayer);
  const downloadWorkflowLayer = DownloadWorkflowLive.pipe(Layer.provide(downloadSupportLayer));
  const progressLayer = ProgressLive.pipe(Layer.provide(downloadWorkflowLayer));
  const searchSupportLayer = Layer.mergeAll(
    platformLayer,
    sharedStateLayer,
    progressLayer,
    animeLayer,
  );
  const catalogSupportLayer = Layer.mergeAll(
    platformLayer,
    downloadWorkflowLayer,
    progressLayer,
    CatalogLibraryReadSupportLive,
  );
  const catalogWorkflowLayer = CatalogWorkflowLive.pipe(Layer.provide(catalogSupportLayer));
  const searchWorkflowLayer = SearchWorkflowLive.pipe(Layer.provide(searchSupportLayer));
  const operationsLayer = Layer.mergeAll(
    downloadWorkflowLayer,
    catalogWorkflowLayer,
    searchWorkflowLayer,
  );
  const backgroundControllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, operationsLayer, animeLayer)),
  );
  const backgroundLayer = backgroundControllerLayer;
  const authLayer = Layer.mergeAll(
    AuthBootstrapServiceLive.pipe(Layer.provide(platformLayer)),
    AuthCredentialServiceLive.pipe(Layer.provide(platformLayer)),
    AuthSessionServiceLive.pipe(Layer.provide(platformLayer)),
  );
  const systemBootstrapLayer = SystemBootstrapServiceLive.pipe(Layer.provide(platformLayer));
  const qualityProfileServiceLayer = QualityProfileServiceLive.pipe(Layer.provide(platformLayer));
  const releaseProfileServiceLayer = ReleaseProfileServiceLive.pipe(Layer.provide(platformLayer));
  const systemLogServiceLayer = SystemLogServiceLive.pipe(Layer.provide(platformLayer));
  const systemConfigLayer = SystemConfigServiceLive.pipe(Layer.provide(platformLayer));
  const systemConfigUpdateLayer = SystemConfigUpdateServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, backgroundControllerLayer)),
  );
  const systemStatusLayer = SystemStatusServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, systemConfigLayer)),
  );
  const systemDashboardLayer = SystemDashboardServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, systemConfigLayer)),
  );
  const systemLayer = Layer.mergeAll(
    systemBootstrapLayer,
    systemConfigLayer,
    systemConfigUpdateLayer,
    systemStatusLayer,
    systemDashboardLayer,
    qualityProfileServiceLayer,
    releaseProfileServiceLayer,
    systemLogServiceLayer,
  );
  const libraryRootsLayer = LibraryRootsServiceLive.pipe(Layer.provide(platformLayer));
  const libraryBrowseLayer = LibraryBrowseServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(platformLayer, operationsLayer, systemConfigLayer, libraryRootsLayer),
    ),
  );
  const metricsLayer = MetricsServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, operationsLayer, systemStatusLayer)),
  );
  const imageAssetLayer = ImageAssetServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, systemConfigLayer)),
  );
  const animeEnrollmentLayer = AnimeEnrollmentServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, operationsLayer, animeLayer)),
  );
  const appLayer = Layer.mergeAll(
    operationsLayer,
    animeLayer,
    backgroundLayer,
    authLayer,
    systemLayer,
    libraryRootsLayer,
    libraryBrowseLayer,
    metricsLayer,
    imageAssetLayer,
    animeEnrollmentLayer,
  );

  return {
    appLayer,
    platformLayer,
  } as const;
}

export type ApiLifecycleLayers = ReturnType<typeof makeApiLifecycleLayers>;
