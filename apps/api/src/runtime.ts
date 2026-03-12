import { Effect, Layer, ManagedRuntime } from "effect";

import { AppRuntime } from "./app-runtime.ts";
import { AppConfig, type AppConfigShape } from "./config.ts";
import { DatabaseLive } from "./db/database.ts";
import { AniListClientLive } from "./features/anime/anilist.ts";
import { AnimeServiceLive } from "./features/anime/service.ts";
import { AuthServiceLive } from "./features/auth/service.ts";
import { EventBusLive } from "./features/events/event-bus.ts";
import { QBitTorrentClientLive } from "./features/operations/qbittorrent.ts";
import { RssClientLive } from "./features/operations/rss-client.ts";
import { OperationsServiceLive } from "./features/operations/service.ts";
import { SystemServiceLive } from "./features/system/service.ts";
import { RuntimeLoggerLayer } from "./lib/logging.ts";

export function makeApiLayer(overrides: Partial<AppConfigShape> = {}) {
  const configLayer = AppConfig.layer(overrides);
  const runtimeLayer = AppRuntime.layer();
  const databaseLayer = DatabaseLive.pipe(Layer.provide(configLayer));
  const eventBusLayer = EventBusLive;
  const platformLayer = Layer.mergeAll(
    configLayer,
    runtimeLayer,
    RuntimeLoggerLayer,
    databaseLayer,
    eventBusLayer,
    AniListClientLive,
    QBitTorrentClientLive,
    RssClientLive,
  );
  const servicesLayer = Layer.mergeAll(
    AuthServiceLive,
    AnimeServiceLive,
    OperationsServiceLive,
    SystemServiceLive,
  ).pipe(Layer.provide(platformLayer));

  return Layer.mergeAll(platformLayer, servicesLayer);
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
