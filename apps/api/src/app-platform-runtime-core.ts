import { CommandExecutor, FetchHttpClient } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { ConfigProvider, Layer } from "effect";

import { AppRuntime } from "@/app-runtime.ts";
import { AppConfig, type AppConfigShape } from "@/config.ts";
import { DatabaseLayerLive } from "@/db/database.ts";
import { BackgroundWorkerMonitorLive } from "@/background-monitor.ts";
import { EventBusLive } from "@/features/events/event-bus.ts";
import { EventPublisherLive } from "@/features/events/publisher.ts";
import { ClockServiceLive } from "@/lib/clock.ts";
import { FileSystemLive } from "@/lib/filesystem.ts";
import { RandomServiceLive } from "@/lib/random.ts";
import { RuntimeLoggerLayer } from "@/lib/logging.ts";
import { TokenHasherLive } from "@/security/token-hasher.ts";

export interface AppPlatformRuntimeOptions {
  readonly commandExecutorLayer?: Layer.Layer<CommandExecutor.CommandExecutor, never, never>;
  readonly configProvider?: ConfigProvider.ConfigProvider;
}

export function makeAppPlatformCoreRuntimeLayer(
  overrides: Partial<AppConfigShape> = {},
  options?: AppPlatformRuntimeOptions,
) {
  const coreSupportLayer = Layer.mergeAll(
    ClockServiceLive,
    RandomServiceLive,
    FetchHttpClient.layer,
  );
  const configBaseLayer = options?.configProvider
    ? AppConfig.layer(overrides).pipe(
        Layer.provide(Layer.setConfigProvider(options.configProvider)),
      )
    : AppConfig.layer(overrides);
  const configLayer = configBaseLayer.pipe(Layer.provide(coreSupportLayer));
  const runtimeLayer = AppRuntime.layer().pipe(Layer.provide(coreSupportLayer));
  const databaseLayer = DatabaseLayerLive.pipe(Layer.provide(configLayer));
  const eventBusLayer = EventBusLive;
  const eventSupportLayer = Layer.mergeAll(eventBusLayer, coreSupportLayer);
  const eventPublisherLayer = EventPublisherLive.pipe(Layer.provide(eventSupportLayer));
  const backgroundMonitorLayer = BackgroundWorkerMonitorLive.pipe(Layer.provide(coreSupportLayer));

  return Layer.mergeAll(
    BunContext.layer,
    coreSupportLayer,
    configLayer,
    runtimeLayer,
    RuntimeLoggerLayer,
    databaseLayer,
    eventBusLayer,
    eventPublisherLayer,
    backgroundMonitorLayer,
    FileSystemLive,
    TokenHasherLive,
  );
}
