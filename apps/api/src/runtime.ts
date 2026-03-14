import { Effect, Layer, ManagedRuntime } from "effect";

import { AppRuntime } from "./app-runtime.ts";
import {
  BackgroundWorkerControllerLive,
  BackgroundWorkerMonitorLive,
} from "./background.ts";
import { AppConfig, type AppConfigShape } from "./config.ts";
import { DatabaseLive } from "./db/database.ts";
import { AniListClientLive } from "./features/anime/anilist.ts";
import { AnimeServiceLive } from "./features/anime/service.ts";
import { AuthServiceLive } from "./features/auth/service.ts";
import { EventBusLive } from "./features/events/event-bus.ts";
import { EventPublisherLive } from "./features/events/publisher.ts";
import { QBitTorrentClientLive } from "./features/operations/qbittorrent.ts";
import { RssClientLive } from "./features/operations/rss-client.ts";
import { OperationsServiceLive } from "./features/operations/service.ts";
import { SystemServiceLive } from "./features/system/service.ts";
import { FileSystemLive } from "./lib/filesystem.ts";
import { RuntimeLoggerLayer } from "./lib/logging.ts";

export function makeApiLayer(overrides: Partial<AppConfigShape> = {}) {
  const configLayer = AppConfig.layer(overrides);
  const runtimeLayer = AppRuntime.layer();
  const databaseLayer = DatabaseLive.pipe(Layer.provide(configLayer));
  const eventBusLayer = EventBusLive;
  const eventPublisherLayer = EventPublisherLive.pipe(Layer.provide(eventBusLayer));
  const backgroundMonitorLayer = BackgroundWorkerMonitorLive;
  const platformLayer = Layer.mergeAll(
    configLayer,
    runtimeLayer,
    RuntimeLoggerLayer,
    databaseLayer,
    eventBusLayer,
    eventPublisherLayer,
    backgroundMonitorLayer,
    AniListClientLive,
    QBitTorrentClientLive,
    RssClientLive,
    FileSystemLive,
  );
  const operationsLayer = OperationsServiceLive.pipe(
    Layer.provide(platformLayer),
  );
  const controllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, operationsLayer)),
  );
  const servicesLayer = Layer.mergeAll(
    AuthServiceLive,
    AnimeServiceLive,
    SystemServiceLive,
  ).pipe(
    Layer.provide(
      Layer.mergeAll(platformLayer, operationsLayer, controllerLayer),
    ),
  );

  return Layer.mergeAll(
    platformLayer,
    operationsLayer,
    controllerLayer,
    servicesLayer,
  );
}

export function makeApiRuntime(overrides: Partial<AppConfigShape> = {}) {
  return ManagedRuntime.make(makeApiLayer(overrides));
}

export type ApiRuntime = ReturnType<typeof makeApiRuntime>;

export function runApi<A, E, R>(
  runtime: ApiRuntime,
  effect: Effect.Effect<A, E, R>,
): Promise<A> {
  return runtime.runPromise(effect as Effect.Effect<A, E, never>);
}
