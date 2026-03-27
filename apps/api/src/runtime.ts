import { Effect, Layer, ManagedRuntime } from "effect";

import { makeAppPlatformRuntimeLayer, type RuntimeOptions } from "./app-platform-runtime-layer.ts";
import { makeBackgroundRuntimeLayer } from "./background-runtime-layer.ts";
import { makeAnimeRuntimeLayer } from "./features/anime/anime-runtime-layer.ts";
import { makeAuthRuntimeLayer } from "./features/auth/auth-runtime-layer.ts";
import { makeOperationsRuntimeLayer } from "./features/operations/operations-runtime-layer.ts";
import { makeAppServicesRuntimeLayer } from "./app-services-runtime-layer.ts";
import { makeSystemRuntimeLayers } from "./features/system/system-runtime-layer.ts";
import type { AppConfigShape } from "./config.ts";

export type { RuntimeOptions } from "./app-platform-runtime-layer.ts";

export function makeApiLayer(overrides: Partial<AppConfigShape> = {}, options?: RuntimeOptions) {
  const appPlatformLayer = makeAppPlatformRuntimeLayer(overrides, options);

  const operationsLayer = makeOperationsRuntimeLayer(appPlatformLayer);
  const animeLayer = makeAnimeRuntimeLayer(appPlatformLayer);
  const controllerLayer = makeBackgroundRuntimeLayer(appPlatformLayer, operationsLayer, animeLayer);
  const authLayer = makeAuthRuntimeLayer(appPlatformLayer);
  const { systemConfigLayer, systemLayer, systemStatusLayer } = makeSystemRuntimeLayers(
    appPlatformLayer,
    controllerLayer,
  );
  const appServicesLayer = makeAppServicesRuntimeLayer(
    appPlatformLayer,
    operationsLayer,
    systemConfigLayer,
    systemStatusLayer,
    animeLayer,
  );

  return Layer.mergeAll(
    appPlatformLayer,
    operationsLayer,
    animeLayer,
    controllerLayer,
    authLayer,
    systemLayer,
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
