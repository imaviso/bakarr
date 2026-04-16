import { FetchHttpClient } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { ConfigProvider, Layer } from "effect";

import { AppRuntime } from "@/app-runtime.ts";
import { AppConfig, type AppConfigShape } from "@/config.ts";
import { DatabaseLayerLive } from "@/db/database.ts";
import { BackgroundWorkerMonitorLive } from "@/background-monitor.ts";
import { EventBusLive } from "@/features/events/event-bus.ts";
import { ClockServiceLive } from "@/lib/clock.ts";
import { ExternalCallLive } from "@/lib/effect-retry.ts";
import { FileSystemLive } from "@/lib/filesystem.ts";
import { RandomServiceLive } from "@/lib/random.ts";
import { RuntimeLoggerLayer } from "@/lib/logging.ts";
import { TokenHasherLive } from "@/security/token-hasher.ts";

export interface AppPlatformRuntimeOptions {
  readonly configProvider?: ConfigProvider.ConfigProvider;
}

export function makeAppPlatformCoreRuntimeLayer(
  overrides: Partial<AppConfigShape> = {},
  options?: AppPlatformRuntimeOptions,
) {
  const clockAndHttpLayer = Layer.mergeAll(ClockServiceLive, FetchHttpClient.layer);
  const runtimeSupportLayer = Layer.mergeAll(clockAndHttpLayer, RandomServiceLive);
  const withRuntimeSupport = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
    layer.pipe(Layer.provide(runtimeSupportLayer));

  const configBaseLayer = options?.configProvider
    ? AppConfig.layer(overrides).pipe(
        Layer.provide(Layer.setConfigProvider(options.configProvider)),
      )
    : AppConfig.layer(overrides);
  const configLayer = configBaseLayer;
  const runtimeLayer = AppRuntime.Live.pipe(Layer.provide(clockAndHttpLayer));
  const externalCallLayer = ExternalCallLive.pipe(Layer.provide(clockAndHttpLayer));
  const databaseLayer = DatabaseLayerLive.pipe(Layer.provide(configLayer));
  const eventBusLayer = EventBusLive;
  const backgroundMonitorLayer = withRuntimeSupport(BackgroundWorkerMonitorLive);

  const platformCoreLayer = Layer.mergeAll(
    BunContext.layer,
    runtimeSupportLayer,
    configLayer,
    runtimeLayer,
    RuntimeLoggerLayer,
    databaseLayer,
    externalCallLayer,
  );

  const infrastructureLayer = Layer.mergeAll(
    eventBusLayer,
    backgroundMonitorLayer,
    FileSystemLive,
    TokenHasherLive,
  );

  return Layer.mergeAll(platformCoreLayer, infrastructureLayer);
}
