import { Effect, Layer, ManagedRuntime } from "effect";

import { makeApiLifecycleLayers } from "./api-lifecycle-layers.ts";
import { type RuntimeOptions } from "./app-platform-runtime-layer.ts";
import type { AppConfigShape } from "./config.ts";

export type { RuntimeOptions } from "./app-platform-runtime-layer.ts";

export function makeApiLayer(overrides: Partial<AppConfigShape> = {}, options?: RuntimeOptions) {
  const layers = makeApiLifecycleLayers(overrides, options);

  return Layer.mergeAll(layers.platformLayer, layers.appLayer);
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
