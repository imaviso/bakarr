import { ManagedRuntime } from "effect";

import type { AppConfigShape } from "@/config.ts";
import { bootstrapProgram } from "@/api-startup.ts";
import { makeApiLifecycleLayers } from "@/api-lifecycle-layers.ts";
import { createHttpApp } from "@/http/http-app.ts";

type RuntimeOptions = Parameters<typeof makeApiLifecycleLayers>[1];

function makeApiRuntime(overrides: Partial<AppConfigShape> = {}, options?: RuntimeOptions) {
  return ManagedRuntime.make(
    makeApiLifecycleLayers(overrides, options).appLayer as import("effect").Layer.Layer<
      unknown,
      unknown,
      never
    >,
  );
}

export async function bootstrapApiTestRuntime(
  overrides: Partial<AppConfigShape> = {},
  runtimeOptions?: RuntimeOptions,
) {
  const runtime = makeApiRuntime(overrides, runtimeOptions);
  const config = await runtime.runPromise(bootstrapProgram());
  const httpApp = await runtime.runPromise(createHttpApp());

  return {
    config,
    httpApp,
    runtime,
  };
}
