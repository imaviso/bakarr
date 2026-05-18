import { FetchHttpClient } from "@effect/platform";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { ConfigProvider, Effect, Layer } from "effect";

import { AppRuntime } from "@/app/runtime.ts";
import {
  AppConfig,
  BootstrapConfig,
  type AppConfigOverrides,
  type BootstrapConfigOverrides,
} from "@/config/schema.ts";
import { ObservabilityConfig, type ObservabilityConfigOverrides } from "@/config/observability.ts";
import { makeDotenvConfigProvider } from "@/config/provider.ts";
import { DatabaseLayerLive } from "@/db/database.ts";
import { BackgroundWorkerMonitorLive } from "@/background/monitor.ts";
import { EventBusLive } from "@/features/events/event-bus.ts";
import { ClockServiceLive } from "@/infra/clock.ts";
import { ExternalCallLive } from "@/infra/effect/retry.ts";
import { FileSystemLive } from "@/infra/filesystem/filesystem.ts";
import { RandomServiceLive } from "@/infra/random.ts";
import { RuntimeLoggerLayer } from "@/infra/logging.ts";
import { TelemetryLayer } from "@/infra/telemetry.ts";
import { PasswordCryptoLive } from "@/security/password.ts";
import { TokenHasherLive } from "@/security/token-hasher.ts";

export interface AppPlatformRuntimeOptions {
  readonly configProvider?: ConfigProvider.ConfigProvider;
}

export function makeAppPlatformCoreRuntimeLayer(
  overrides: AppConfigOverrides & BootstrapConfigOverrides & ObservabilityConfigOverrides = {},
  options?: AppPlatformRuntimeOptions,
) {
  const clockAndHttpLayer = Layer.mergeAll(ClockServiceLive, FetchHttpClient.layer);
  const runtimeSupportLayer = Layer.mergeAll(clockAndHttpLayer, RandomServiceLive);
  const withRuntimeSupport = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
    layer.pipe(Layer.provide(runtimeSupportLayer));

  const appConfigLayer = AppConfig.layerWithOverrides(overrides);
  const bootstrapConfigLayer = BootstrapConfig.layerWithOverrides(overrides);
  const observabilityConfigLayer = ObservabilityConfig.layerWithOverrides(overrides).pipe(
    Layer.provide(appConfigLayer),
  );
  const configProviderLayer = options?.configProvider
    ? Layer.setConfigProvider(options.configProvider)
    : Layer.unwrapEffect(makeDotenvConfigProvider().pipe(Effect.map(Layer.setConfigProvider))).pipe(
        Layer.provide(NodeFileSystem.layer),
      );

  const configLayer = Layer.mergeAll(
    appConfigLayer,
    bootstrapConfigLayer,
    observabilityConfigLayer,
  ).pipe(Layer.provide(configProviderLayer));
  const runtimeLayer = AppRuntime.Live.pipe(Layer.provide(clockAndHttpLayer));
  const externalCallLayer = ExternalCallLive.pipe(Layer.provide(clockAndHttpLayer));
  const databaseLayer = DatabaseLayerLive.pipe(
    Layer.provide(configLayer),
    Layer.provide(NodeContext.layer),
  );
  const eventBusLayer = EventBusLive;
  const backgroundMonitorLayer = withRuntimeSupport(BackgroundWorkerMonitorLive);
  const telemetryLayer = TelemetryLayer.pipe(
    Layer.provide(Layer.mergeAll(configLayer, runtimeSupportLayer)),
  );

  const platformCoreLayer = Layer.mergeAll(
    NodeContext.layer,
    runtimeSupportLayer,
    configLayer,
    runtimeLayer,
    RuntimeLoggerLayer,
    telemetryLayer,
    databaseLayer,
    externalCallLayer,
  );

  const infrastructureLayer = Layer.mergeAll(
    eventBusLayer,
    backgroundMonitorLayer,
    FileSystemLive,
    PasswordCryptoLive,
    TokenHasherLive,
  );

  return Layer.mergeAll(platformCoreLayer, infrastructureLayer);
}
