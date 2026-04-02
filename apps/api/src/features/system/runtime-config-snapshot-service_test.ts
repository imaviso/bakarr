import assert from "node:assert/strict";
import { Cause, Effect, Exit, Layer } from "effect";

import { StoredConfigMissingError } from "@/features/system/errors.ts";
import {
  RuntimeConfigSnapshotService,
  RuntimeConfigSnapshotServiceLive,
} from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemConfigService } from "@/features/system/system-config-service.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { it } from "@effect/vitest";

it.effect("RuntimeConfigSnapshotService caches loaded config", () =>
  Effect.gen(function* () {
    let calls = 0;
    const config = makeTestConfig("./runtime-config-cache.sqlite");

    const layer = RuntimeConfigSnapshotServiceLive.pipe(
      Layer.provide(
        Layer.succeed(SystemConfigService, {
          getConfig: () =>
            Effect.sync(() => {
              calls += 1;
              return config;
            }),
        }),
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

    const layer = RuntimeConfigSnapshotServiceLive.pipe(
      Layer.provide(
        Layer.succeed(SystemConfigService, {
          getConfig: () =>
            Effect.sync(() => {
              calls += 1;
              return persisted;
            }),
        }),
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

it.effect("RuntimeConfigSnapshotService forwards SystemConfigService failures", () =>
  Effect.gen(function* () {
    const missing = new StoredConfigMissingError({ message: "missing config" });

    const layer = RuntimeConfigSnapshotServiceLive.pipe(
      Layer.provide(
        Layer.succeed(SystemConfigService, {
          getConfig: () => Effect.fail(missing),
        }),
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
