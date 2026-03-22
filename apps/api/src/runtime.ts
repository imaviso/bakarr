import { FetchHttpClient } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { ConfigProvider, Effect, Layer, ManagedRuntime } from "effect";

import { AppRuntime } from "./app-runtime.ts";
import {
  BackgroundWorkerControllerLive,
  BackgroundWorkerMonitorLive,
} from "./background.ts";
import { AppConfig, type AppConfigShape } from "./config.ts";
import { DatabaseLive } from "./db/database.ts";
import { AniListClient, AniListClientLive } from "./features/anime/anilist.ts";
import { AnimeServiceLive } from "./features/anime/service.ts";
import { AuthServiceLive } from "./features/auth/service.ts";
import { EventBusLive } from "./features/events/event-bus.ts";
import { EventPublisherLive } from "./features/events/publisher.ts";
import {
  QBitTorrentClient,
  QBitTorrentClientLive,
} from "./features/operations/qbittorrent.ts";
import { RssClient, RssClientLive } from "./features/operations/rss-client.ts";
import {
  SeaDexClient,
  SeaDexClientLive,
} from "./features/operations/seadex-client.ts";
import { OperationsServiceLive } from "./features/operations/service.ts";
import { SystemServiceLive } from "./features/system/service.ts";
import { FileSystemLive } from "./lib/filesystem.ts";
import { MediaProbeLive } from "./lib/media-probe.ts";
import { RuntimeLoggerLayer } from "./lib/logging.ts";

export interface RuntimeOptions {
  aniListLayer?: Layer.Layer<AniListClient>;
  configProvider?: ConfigProvider.ConfigProvider;
  qbitLayer?: Layer.Layer<QBitTorrentClient>;
  rssLayer?: Layer.Layer<RssClient>;
  seadexLayer?: Layer.Layer<SeaDexClient>;
}

export function makeApiLayer(
  overrides: Partial<AppConfigShape> = {},
  options?: RuntimeOptions,
) {
  const configLayer = options?.configProvider
    ? AppConfig.layer(overrides).pipe(
      Layer.provide(Layer.setConfigProvider(options.configProvider)),
    )
    : AppConfig.layer(overrides);
  const runtimeLayer = AppRuntime.layer();
  const httpClientLayer = FetchHttpClient.layer;
  const databaseLayer = DatabaseLive.pipe(Layer.provide(configLayer));
  const eventBusLayer = EventBusLive;
  const eventPublisherLayer = EventPublisherLive.pipe(
    Layer.provide(eventBusLayer),
  );
  const backgroundMonitorLayer = BackgroundWorkerMonitorLive;
  const aniListLayer = options?.aniListLayer
    ? options.aniListLayer
    : AniListClientLive.pipe(Layer.provide(httpClientLayer));
  const rssLayer = options?.rssLayer
    ? options.rssLayer
    : RssClientLive.pipe(Layer.provide(httpClientLayer));
  const qbitLayer = options?.qbitLayer
    ? options.qbitLayer
    : QBitTorrentClientLive.pipe(Layer.provide(httpClientLayer));
  const seadexLayer = options?.seadexLayer
    ? options.seadexLayer
    : SeaDexClientLive.pipe(Layer.provide(httpClientLayer));
  const externalClientsLayer = Layer.mergeAll(
    aniListLayer,
    rssLayer,
    qbitLayer,
    seadexLayer,
  ).pipe(Layer.provide(httpClientLayer));
  const platformLayer = Layer.mergeAll(
    NodeContext.layer,
    configLayer,
    runtimeLayer,
    RuntimeLoggerLayer,
    httpClientLayer,
    databaseLayer,
    eventBusLayer,
    eventPublisherLayer,
    backgroundMonitorLayer,
    externalClientsLayer,
    FileSystemLive,
    MediaProbeLive,
  );
  const operationsLayer = OperationsServiceLive.pipe(
    Layer.provide(platformLayer),
  );
  const animeServiceLayer = AnimeServiceLive.pipe(
    Layer.provide(platformLayer),
  );
  const controllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provide(
      Layer.mergeAll(platformLayer, operationsLayer, animeServiceLayer),
    ),
  );
  const servicesLayer = Layer.mergeAll(
    AuthServiceLive,
    SystemServiceLive,
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        platformLayer,
        operationsLayer,
        controllerLayer,
        animeServiceLayer,
      ),
    ),
  );

  return Layer.mergeAll(
    platformLayer,
    operationsLayer,
    animeServiceLayer,
    controllerLayer,
    servicesLayer,
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

export function runApi<A, E>(
  runtime: ApiRuntime,
  effect: ApiEffect<A, E>,
): Promise<A> {
  return runtime.runPromise(effect);
}
