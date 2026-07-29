import { FetchHttpClient } from "effect/unstable/http";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { ConfigProvider, Layer } from "effect";

import { AppRuntime } from "@/app/runtime.ts";
import { dotEnvAddLayer } from "@/config/provider.ts";
import {
  AppConfig,
  BootstrapConfig,
  type AppConfigOverrides,
  type BootstrapConfigOverrides,
} from "@/config/schema.ts";
import { ObservabilityConfig, type ObservabilityConfigOverrides } from "@/config/observability.ts";
import { DatabaseLayerLive } from "@/db/database.ts";
import { BackgroundWorkerMonitorLive } from "@/background/monitor.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { ExternalCallLive } from "@/infra/effect/retry.ts";
import { FileSystemLive } from "@/infra/filesystem/filesystem.ts";
import { RandomService } from "@/infra/random.ts";
import { RuntimeLoggerLayer } from "@/infra/logging.ts";
import { TelemetryLayer } from "@/infra/telemetry.ts";
import { PasswordCrypto } from "@/security/password.ts";
import { TokenHasher } from "@/security/token-hasher.ts";

export interface AppPlatformRuntimeOptions {
  readonly configProvider?: ConfigProvider.ConfigProvider;
}

export function makeAppPlatformCoreRuntimeLayer(
  overrides: AppConfigOverrides & BootstrapConfigOverrides & ObservabilityConfigOverrides = {},
  options?: AppPlatformRuntimeOptions,
) {
  const httpAndRuntimeLayer = Layer.mergeAll(FetchHttpClient.layer, RandomService.layer);
  const withRuntimeSupport = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
    layer.pipe(Layer.provide(httpAndRuntimeLayer));

  const appConfigLayer = AppConfig.layerWithOverrides(overrides);
  const bootstrapConfigLayer = BootstrapConfig.layerWithOverrides(overrides);
  const observabilityConfigLayer = ObservabilityConfig.layerWithOverrides(overrides).pipe(
    Layer.provide(appConfigLayer),
  );
  const configProviderLayer = options?.configProvider
    ? ConfigProvider.layer(options.configProvider)
    : dotEnvAddLayer.pipe(Layer.provide(NodeFileSystem.layer));

  const configLayer = Layer.mergeAll(
    appConfigLayer,
    bootstrapConfigLayer,
    observabilityConfigLayer,
  ).pipe(Layer.provide(configProviderLayer));
  const runtimeLayer = AppRuntime.layer.pipe(Layer.provide(httpAndRuntimeLayer));
  const externalCallLayer = ExternalCallLive;
  const databaseLayer = DatabaseLayerLive.pipe(
    Layer.provide(configLayer),
    Layer.provide(NodeServices.layer),
  );
  const eventBusLayer = EventBus.layer;
  const backgroundMonitorLayer = withRuntimeSupport(BackgroundWorkerMonitorLive);
  const telemetryLayer = TelemetryLayer.pipe(
    Layer.provide(Layer.mergeAll(configLayer, httpAndRuntimeLayer)),
  );

  const platformCoreLayer = Layer.mergeAll(
    NodeServices.layer,
    httpAndRuntimeLayer,
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
    PasswordCrypto.layer,
    TokenHasher.layer,
  );

  return Layer.mergeAll(platformCoreLayer, infrastructureLayer);
}
