import { Cause, Deferred, Effect, Exit, Fiber, Layer } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { StoredConfigMissingError } from "@/features/system/errors.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemConfigService } from "@/features/system/system-config-service.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { assert, it } from "@effect/vitest";

it.effect("RuntimeConfigSnapshotService caches loaded config", () =>
  Effect.gen(function* () {
    let calls = 0;
    const config = makeTestConfig("./runtime-config-cache.sqlite");

    const layer = RuntimeConfigSnapshotService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.succeed(
          SystemConfigService,
          SystemConfigService.make({
            getConfig: (): Effect.Effect<Config> =>
              Effect.sync(() => {
                calls += 1;
                return config;
              }),
          }),
        ),
      ),
    );

    const loaded = yield* Effect.flatMap(RuntimeConfigSnapshotService, (service) =>
      Effect.all([service.getRuntimeConfig(), service.getRuntimeConfig()]),
    ).pipe(Effect.provide(layer));

    assert.deepStrictEqual(loaded, [config, config]);
    assert.deepStrictEqual(calls, 1);
  }),
);

it.effect("RuntimeConfigSnapshotService returns replaced config without loading", () =>
  Effect.gen(function* () {
    let calls = 0;
    const persisted = makeTestConfig("./runtime-config-persisted.sqlite");
    const replaced = makeTestConfig("./runtime-config-replaced.sqlite");

    const layer = RuntimeConfigSnapshotService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.succeed(
          SystemConfigService,
          SystemConfigService.make({
            getConfig: (): Effect.Effect<Config> =>
              Effect.sync(() => {
                calls += 1;
                return persisted;
              }),
          }),
        ),
      ),
    );

    const result = yield* Effect.flatMap(RuntimeConfigSnapshotService, (service) =>
      Effect.gen(function* () {
        yield* service.replaceRuntimeConfig(replaced);
        return yield* service.getRuntimeConfig();
      }),
    ).pipe(Effect.provide(layer));

    assert.deepStrictEqual(result, replaced);
    assert.deepStrictEqual(calls, 0);
  }),
);

it.effect(
  "RuntimeConfigSnapshotService keeps replaced config if replacement happens during initial load",
  () =>
    Effect.gen(function* () {
      let calls = 0;
      const loadStarted = yield* Deferred.make<void>();
      const loadRelease = yield* Deferred.make<void>();
      const persisted = makeTestConfig("./runtime-config-persisted.sqlite");
      const replaced = makeTestConfig("./runtime-config-replaced.sqlite");

      const layer = RuntimeConfigSnapshotService.DefaultWithoutDependencies.pipe(
        Layer.provide(
          Layer.succeed(
            SystemConfigService,
            SystemConfigService.make({
              getConfig: (): Effect.Effect<Config> =>
                Effect.gen(function* () {
                  calls += 1;
                  yield* Deferred.succeed(loadStarted, void 0);
                  yield* Deferred.await(loadRelease);
                  return persisted;
                }),
            }),
          ),
        ),
      );

      const result = yield* Effect.flatMap(RuntimeConfigSnapshotService, (service) =>
        Effect.gen(function* () {
          const fiber = yield* Effect.fork(service.getRuntimeConfig());
          yield* Deferred.await(loadStarted);
          yield* service.replaceRuntimeConfig(replaced);
          yield* Deferred.succeed(loadRelease, void 0);
          return yield* Fiber.join(fiber);
        }),
      ).pipe(Effect.provide(layer));

      assert.deepStrictEqual(result, replaced);
      assert.deepStrictEqual(calls, 1);
    }),
);

it.effect("RuntimeConfigSnapshotService forwards SystemConfigService failures", () =>
  Effect.gen(function* () {
    const missing = new StoredConfigMissingError({ message: "missing config" });

    const layer = RuntimeConfigSnapshotService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.succeed(
          SystemConfigService,
          SystemConfigService.make({
            getConfig: () => Effect.fail(missing),
          }),
        ),
      ),
    );

    const exit = yield* Effect.exit(
      Effect.flatMap(RuntimeConfigSnapshotService, (service) => service.getRuntimeConfig()).pipe(
        Effect.provide(layer),
      ),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some", Cause.pretty(exit.cause));

      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "StoredConfigMissingError");
      }
    }
  }),
);

it.effect("RuntimeConfigSnapshotService retries after a failed load", () =>
  Effect.gen(function* () {
    let calls = 0;
    const recovered = makeTestConfig("./runtime-config-recovered.sqlite");
    const missing = new StoredConfigMissingError({ message: "missing config" });

    const layer = RuntimeConfigSnapshotService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.succeed(
          SystemConfigService,
          SystemConfigService.make({
            getConfig: () =>
              Effect.gen(function* () {
                calls += 1;

                if (calls === 1) {
                  return yield* Effect.fail(missing);
                }

                return recovered;
              }),
          }),
        ),
      ),
    );

    const result = yield* Effect.flatMap(RuntimeConfigSnapshotService, (service) =>
      Effect.gen(function* () {
        const first = yield* Effect.exit(service.getRuntimeConfig());
        assert.deepStrictEqual(Exit.isFailure(first), true);
        return yield* service.getRuntimeConfig();
      }),
    ).pipe(Effect.provide(layer));

    assert.deepStrictEqual(result, recovered);
    assert.deepStrictEqual(calls, 2);
  }),
);
