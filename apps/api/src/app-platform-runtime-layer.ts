import { CommandExecutor, FetchHttpClient } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { ConfigProvider, Layer } from "effect";

import { AppRuntime } from "./app-runtime.ts";
import { AppConfig, type AppConfigShape } from "./config.ts";
import { DatabaseLive } from "./db/database.ts";
import { AniListClientLive, type AniListClient } from "./features/anime/anilist.ts";
import { BackgroundWorkerMonitorLive } from "./background-monitor.ts";
import { DiskSpaceInspectorLive } from "./features/system/disk-space.ts";
import { EventBusLive } from "./features/events/event-bus.ts";
import { EventPublisherLive } from "./features/events/publisher.ts";
import {
  QBitTorrentClientLive,
  type QBitTorrentClient,
} from "./features/operations/qbittorrent.ts";
import { RssClientLive, type RssClient } from "./features/operations/rss-client.ts";
import { SeaDexClientLive, type SeaDexClient } from "./features/operations/seadex-client.ts";
import { ClockServiceLive } from "./lib/clock.ts";
import { DnsResolverLive } from "./lib/dns-resolver.ts";
import { FileSystemLive } from "./lib/filesystem.ts";
import { MediaProbeLive } from "./lib/media-probe.ts";
import { RandomServiceLive } from "./lib/random.ts";
import { RuntimeLoggerLayer } from "./lib/logging.ts";
import { StreamTokenSignerLive } from "./http/stream-token-signer.ts";
import { TokenHasherLive } from "./security/token-hasher.ts";

export interface RuntimeOptions {
  readonly aniListLayer?: Layer.Layer<AniListClient>;
  readonly commandExecutorLayer?: Layer.Layer<CommandExecutor.CommandExecutor>;
  readonly configProvider?: ConfigProvider.ConfigProvider;
  readonly qbitLayer?: Layer.Layer<QBitTorrentClient>;
  readonly rssLayer?: Layer.Layer<RssClient>;
  readonly seadexLayer?: Layer.Layer<SeaDexClient>;
}

export function makeAppPlatformRuntimeLayer(
  overrides: Partial<AppConfigShape> = {},
  options?: RuntimeOptions,
) {
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
  const mediaProbeLayer = MediaProbeLive;
  const externalClientsLayer = Layer.mergeAll(aniListLayer, rssLayer, qbitLayer, seadexLayer);
  const platformBaseLayer = Layer.mergeAll(
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
    RandomServiceLive,
    StreamTokenSignerLive.pipe(Layer.provide(RandomServiceLive)),
    TokenHasherLive,
  );
  const platformLayer = options?.commandExecutorLayer
    ? Layer.mergeAll(platformBaseLayer, options.commandExecutorLayer)
    : platformBaseLayer;
  const commandExecutorLayer = Layer.mergeAll(DiskSpaceInspectorLive, mediaProbeLayer).pipe(
    Layer.provide(platformLayer),
  );

  return Layer.mergeAll(platformLayer, commandExecutorLayer);
}
