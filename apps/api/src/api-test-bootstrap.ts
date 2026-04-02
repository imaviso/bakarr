import { Effect, ManagedRuntime } from "effect";

import type { AppConfigShape } from "@/config.ts";
import { bootstrapProgram } from "@/api-startup.ts";
import { makeApiLifecycleLayers } from "@/api-lifecycle-layers.ts";
import { createHttpApp } from "@/http/http-app.ts";

type RuntimeOptions = Parameters<typeof makeApiLifecycleLayers>[1];

function makeApiRuntime(overrides: Partial<AppConfigShape> = {}, options?: RuntimeOptions) {
  return ManagedRuntime.make(makeApiLifecycleLayers(overrides, options).appLayer);
}

export const bootstrapApiTestRuntimeEffect = Effect.fn("Test.bootstrapApiTestRuntimeEffect")(
  function* (overrides: Partial<AppConfigShape> = {}, runtimeOptions?: RuntimeOptions) {
    const runtime = makeApiRuntime(overrides, runtimeOptions);
    const config = yield* Effect.promise(() => runtime.runPromise(bootstrapProgram()));
    const httpApp = yield* Effect.promise(() => runtime.runPromise(createHttpApp()));

    return {
      config,
      httpApp,
      runtime,
    };
  },
);

export type BootstrapApiTestRuntime = Effect.Effect.Success<
  ReturnType<typeof bootstrapApiTestRuntimeEffect>
>;

export const withBootstrapApiTestRuntimeEffect = Effect.fn(
  "Test.withBootstrapApiTestRuntimeEffect",
)(function* <A, E, R>(input: {
  readonly overrides?: Partial<AppConfigShape>;
  readonly runtimeOptions?: RuntimeOptions;
  readonly run: (value: BootstrapApiTestRuntime) => Effect.Effect<A, E, R>;
}) {
  const resource: ReturnType<typeof bootstrapApiTestRuntimeEffect> = bootstrapApiTestRuntimeEffect(
    input.overrides,
    input.runtimeOptions,
  );

  return yield* Effect.acquireUseRelease(resource, input.run, ({ runtime }) =>
    Effect.promise(() => runtime.dispose()),
  );
});
