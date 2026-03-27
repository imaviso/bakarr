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
  const platformLayer = makeAppPlatformRuntimeLayer(overrides, options);

  const operationsLayer = makeOperationsRuntimeLayer(platformLayer);
  const animeLayer = makeAnimeRuntimeLayer(platformLayer);
  const backgroundLayer = makeBackgroundRuntimeLayer(platformLayer, operationsLayer, animeLayer);
  const authLayer = makeAuthRuntimeLayer(platformLayer);
  const { systemConfigLayer, systemLayer, systemStatusLayer } = makeSystemRuntimeLayers(
    platformLayer,
    backgroundLayer,
  );
  const appServicesLayer = makeAppServicesRuntimeLayer(
    platformLayer,
    operationsLayer,
    systemConfigLayer,
    systemStatusLayer,
    animeLayer,
  );
  const httpLayer = Layer.mergeAll(authLayer, systemLayer, appServicesLayer);

  return Layer.mergeAll(
    platformLayer,
    operationsLayer,
    animeLayer,
    backgroundLayer,
    httpLayer,
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
