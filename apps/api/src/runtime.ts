import { Effect, ManagedRuntime } from "effect";

import { makeApiLifecycleLayers } from "./api-lifecycle-layers.ts";
import { type AppPlatformRuntimeOptions } from "./app-platform-runtime-core.ts";

export type RuntimeOptions = AppPlatformRuntimeOptions;

export function makeApiRuntime(
  overrides: Parameters<typeof makeApiLifecycleLayers>[0] = {},
  options?: Parameters<typeof makeApiLifecycleLayers>[1],
) {
  return ManagedRuntime.make(makeApiLifecycleLayers(overrides, options).appLayer);
}

export type ApiRuntime = ReturnType<typeof makeApiRuntime>;

export type ApiLayer = ReturnType<typeof makeApiLifecycleLayers>["appLayer"];

export type ApiContext = ManagedRuntime.ManagedRuntime.Context<ApiRuntime>;

export type ApiLayerError = ManagedRuntime.ManagedRuntime.Error<ApiRuntime>;

export type ApiEffect<A, E = never> = Effect.Effect<A, E, ApiContext>;
