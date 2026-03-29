import { Effect, ManagedRuntime } from "effect";

import { makeApiLifecycleLayers } from "./api-lifecycle-layers.ts";
import { type AppPlatformRuntimeOptions } from "./app-platform-runtime-core.ts";
import type { AppConfigShape } from "./config.ts";

export type RuntimeOptions = AppPlatformRuntimeOptions;

export function makeApiLayer(overrides: Partial<AppConfigShape> = {}, options?: RuntimeOptions) {
  return makeApiLifecycleLayers(overrides, options).appLayer;
}

export function makeApiRuntime(
  overrides: Parameters<typeof makeApiLifecycleLayers>[0] = {},
  options?: Parameters<typeof makeApiLifecycleLayers>[1],
) {
  return ManagedRuntime.make(makeApiLayer(overrides, options));
}

export type ApiRuntime = ReturnType<typeof makeApiRuntime>;

export type ApiLayer = ReturnType<typeof makeApiLayer>;

export type ApiContext = ManagedRuntime.ManagedRuntime.Context<ApiRuntime>;

export type ApiLayerError = ManagedRuntime.ManagedRuntime.Error<ApiRuntime>;

export type ApiEffect<A, E = never> = Effect.Effect<A, E, ApiContext>;
