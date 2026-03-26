import { CommandExecutor, FetchHttpClient } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { ConfigProvider, Effect, Layer, ManagedRuntime } from "effect";

import { AppRuntime } from "./app-runtime.ts";
import { BackgroundWorkerControllerLive } from "./background-controller.ts";
import { BackgroundWorkerMonitorLive } from "./background-monitor.ts";
import { AppConfig, type AppConfigShape } from "./config.ts";
import { DatabaseLive } from "./db/database.ts";
import { AniListClient, AniListClientLive } from "./features/anime/anilist.ts";
import { AnimeEnrollmentServiceLive } from "./features/anime/anime-enrollment-service.ts";
import { AnimeServiceLive } from "./features/anime/service.ts";
import { AuthServiceLive } from "./features/auth/service.ts";
import { EventBusLive } from "./features/events/event-bus.ts";
import { EventPublisherLive } from "./features/events/publisher.ts";
import { LibraryRootsServiceLive } from "./features/library-roots/service.ts";
import { LibraryBrowseServiceLive } from "./features/operations/library-browse-service.ts";
import { operationsOrchestrationLayer } from "./features/operations/operations-orchestration.ts";
import { DownloadServiceLive } from "./features/operations/download-service-live.ts";
import { LibraryServiceLive } from "./features/operations/library-service-live.ts";
import { RssServiceLive } from "./features/operations/rss-service-live.ts";
import { SearchServiceLive } from "./features/operations/search-service-live.ts";
import { QBitTorrentClient, QBitTorrentClientLive } from "./features/operations/qbittorrent.ts";
import { RssClient, RssClientLive } from "./features/operations/rss-client.ts";
import { SeaDexClient, SeaDexClientLive } from "./features/operations/seadex-client.ts";
import { ImageAssetServiceLive } from "./features/system/image-asset-service.ts";
import { MetricsServiceLive } from "./features/system/metrics-service.ts";
import { QualityProfileServiceLive } from "./features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "./features/system/release-profile-service.ts";
import { SystemBootstrapServiceLive } from "./features/system/system-bootstrap-service.ts";
import { SystemConfigServiceLive } from "./features/system/system-config-service.ts";
import { SystemDashboardServiceLive } from "./features/system/system-dashboard-service.ts";
import { SystemLogServiceLive } from "./features/system/system-log-service.ts";
import { SystemStatusServiceLive } from "./features/system/system-status-service.ts";
import { DnsResolverLive } from "./lib/dns-resolver.ts";
import { FileSystemLive } from "./lib/filesystem.ts";
import { ClockServiceLive } from "./lib/clock.ts";
import { MediaProbeLive } from "./lib/media-probe.ts";
import { RuntimeLoggerLayer } from "./lib/logging.ts";
import { RandomServiceLive } from "./lib/random.ts";
import { StreamTokenSignerLive } from "./http/stream-token-signer.ts";
import { TokenHasherLive } from "./security/token-hasher.ts";

export interface RuntimeOptions {
  aniListLayer?: Layer.Layer<AniListClient>;
  commandExecutorLayer?: Layer.Layer<CommandExecutor.CommandExecutor>;
  configProvider?: ConfigProvider.ConfigProvider;
  qbitLayer?: Layer.Layer<QBitTorrentClient>;
  rssLayer?: Layer.Layer<RssClient>;
  seadexLayer?: Layer.Layer<SeaDexClient>;
}

export function makeApiLayer(overrides: Partial<AppConfigShape> = {}, options?: RuntimeOptions) {
  const configBaseLayer = options?.configProvider
    ? AppConfig.layer(overrides).pipe(
        Layer.provide(Layer.setConfigProvider(options.configProvider)),
      )
    : AppConfig.layer(overrides);
  const configLayer = configBaseLayer.pipe(Layer.provide(RandomServiceLive));
  const runtimeLayer = AppRuntime.layer().pipe(Layer.provide(ClockServiceLive));
  const httpClientLayer = FetchHttpClient.layer;
  const databaseLayer = DatabaseLive.pipe(Layer.provide(configLayer));
  const eventBusLayer = EventBusLive;
  const eventPublisherLayer = EventPublisherLive.pipe(
    Layer.provide(Layer.mergeAll(eventBusLayer, ClockServiceLive)),
  );
  const backgroundMonitorLayer = BackgroundWorkerMonitorLive.pipe(Layer.provide(ClockServiceLive));
  const aniListLayer = options?.aniListLayer
    ? options.aniListLayer
    : AniListClientLive.pipe(Layer.provide(Layer.mergeAll(httpClientLayer, ClockServiceLive)));
  const dnsLayer = DnsResolverLive;
  const rssLayer = options?.rssLayer
    ? options.rssLayer
    : RssClientLive.pipe(
        Layer.provide(Layer.mergeAll(httpClientLayer, dnsLayer, ClockServiceLive)),
      );
  const qbitLayer = options?.qbitLayer
    ? options.qbitLayer
    : QBitTorrentClientLive.pipe(Layer.provide(Layer.mergeAll(httpClientLayer, ClockServiceLive)));
  const seadexLayer = options?.seadexLayer
    ? options.seadexLayer
    : SeaDexClientLive.pipe(Layer.provide(Layer.mergeAll(httpClientLayer, ClockServiceLive)));
  const mediaProbeLayer = options?.commandExecutorLayer
    ? MediaProbeLive.pipe(Layer.provide(options.commandExecutorLayer))
    : MediaProbeLive;
  const externalClientsLayer = Layer.mergeAll(aniListLayer, rssLayer, qbitLayer, seadexLayer);
  const basePlatformLayer = Layer.mergeAll(
    BunContext.layer,
    configLayer,
    runtimeLayer,
    RuntimeLoggerLayer,
    httpClientLayer,
    databaseLayer,
    eventBusLayer,
    eventPublisherLayer,
    backgroundMonitorLayer,
    externalClientsLayer,
    ClockServiceLive,
    FileSystemLive,
    mediaProbeLayer,
    RandomServiceLive,
    StreamTokenSignerLive.pipe(Layer.provide(RandomServiceLive)),
    TokenHasherLive,
  );
  const platformLayer = options?.commandExecutorLayer
    ? Layer.mergeAll(basePlatformLayer, options.commandExecutorLayer)
    : basePlatformLayer;
  // Phase 3 flat operations wiring: orchestration layer + individual service layers
  const orchestrationLayer = operationsOrchestrationLayer.pipe(Layer.provide(platformLayer));

  const operationsLayer = Layer.mergeAll(
    RssServiceLive,
    LibraryServiceLive,
    DownloadServiceLive,
    SearchServiceLive,
  ).pipe(Layer.provide(Layer.mergeAll(platformLayer, orchestrationLayer)));

  const animeServiceLayer = AnimeServiceLive.pipe(Layer.provide(platformLayer));
  const controllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, operationsLayer, animeServiceLayer)),
  );
  // System feature services (leaf services with no cross-feature deps first)
  const authServiceLayer = AuthServiceLive.pipe(Layer.provide(platformLayer));
  const systemBootstrapLayer = SystemBootstrapServiceLive.pipe(Layer.provide(platformLayer));
  const qualityProfileServiceLayer = QualityProfileServiceLive.pipe(Layer.provide(platformLayer));
  const releaseProfileServiceLayer = ReleaseProfileServiceLive.pipe(Layer.provide(platformLayer));
  const systemLogServiceLayer = SystemLogServiceLive.pipe(Layer.provide(platformLayer));

  // SystemConfigService depends on BackgroundWorkerController (already in controllerLayer)
  const systemConfigServiceLayer = SystemConfigServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, controllerLayer)),
  );

  // These depend on SystemConfigService
  const systemStatusServiceLayer = SystemStatusServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, systemConfigServiceLayer)),
  );
  const systemDashboardServiceLayer = SystemDashboardServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, systemConfigServiceLayer)),
  );

  const servicesLayer = Layer.mergeAll(
    authServiceLayer,
    systemBootstrapLayer,
    systemConfigServiceLayer,
    systemStatusServiceLayer,
    systemDashboardServiceLayer,
    qualityProfileServiceLayer,
    releaseProfileServiceLayer,
    systemLogServiceLayer,
  );

  // Application-level services: thin orchestrators extracted from HTTP routes.
  const libraryRootsLayer = LibraryRootsServiceLive.pipe(Layer.provide(platformLayer));

  const appServicesLayer = Layer.mergeAll(
    libraryRootsLayer,
    LibraryBrowseServiceLive.pipe(
      Layer.provide(
        Layer.mergeAll(platformLayer, operationsLayer, systemConfigServiceLayer, libraryRootsLayer),
      ),
    ),
    MetricsServiceLive.pipe(
      Layer.provide(Layer.mergeAll(platformLayer, operationsLayer, systemStatusServiceLayer)),
    ),
    ImageAssetServiceLive.pipe(
      Layer.provide(Layer.mergeAll(platformLayer, systemConfigServiceLayer)),
    ),
    AnimeEnrollmentServiceLive.pipe(
      Layer.provide(Layer.mergeAll(platformLayer, operationsLayer, animeServiceLayer)),
    ),
  );

  return Layer.mergeAll(
    platformLayer,
    orchestrationLayer,
    operationsLayer,
    animeServiceLayer,
    controllerLayer,
    servicesLayer,
    appServicesLayer,
  );
}

export function makeApiRuntime(
  overrides: Partial<AppConfigShape> = {},
  options?: Parameters<typeof makeApiLayer>[1],
) {
  return ManagedRuntime.make(makeApiLayer(overrides, options));
}

export type ApiRuntime = ReturnType<typeof makeApiRuntime>;

export type ApiLayer = ReturnType<typeof makeApiLayer>;

export type ApiContext = ManagedRuntime.ManagedRuntime.Context<ApiRuntime>;

export type ApiLayerError = ManagedRuntime.ManagedRuntime.Error<ApiRuntime>;

export type ApiEffect<A, E = never> = Effect.Effect<A, E, ApiContext>;
