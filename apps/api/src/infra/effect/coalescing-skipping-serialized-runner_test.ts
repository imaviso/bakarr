import { assert, it } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";

import { makeSkippingSerializedEffectRunner } from "@/infra/effect/coalescing-skipping-serialized-runner.ts";

it.effect("SkippingSerializedEffectRunner runs first call", () =>
  Effect.gen(function* () {
    let runs = 0;
    const runner = yield* makeSkippingSerializedEffectRunner(
      Effect.sync(() => {
        runs += 1;
        return 42;
      }),
    );
    const result = yield* runner.trigger;
    assert.deepStrictEqual(result._tag, "Some");
    if (result._tag === "Some") assert.deepStrictEqual(result.value, 42);
    assert.deepStrictEqual(runs, 1);
  }),
);

it.effect("SkippingSerializedEffectRunner skips overlapping calls", () =>
  Effect.gen(function* () {
    const firstRunStarted = yield* Deferred.make<void>();
    const releaseFirstRun = yield* Deferred.make<void>();
    let runs = 0;
    const runner = yield* makeSkippingSerializedEffectRunner(
      Effect.gen(function* () {
        runs += 1;
        yield* Deferred.succeed(firstRunStarted, void 0);
        yield* Deferred.await(releaseFirstRun);
        return 42;
      }),
    );
    const firstTrigger = yield* Effect.fork(runner.trigger);
    yield* Deferred.await(firstRunStarted);

    const secondResult = yield* runner.trigger;
    assert.deepStrictEqual(secondResult._tag, "None");
    assert.deepStrictEqual(runs, 1);

    yield* Deferred.succeed(releaseFirstRun, void 0);
    const firstResult = yield* Fiber.join(firstTrigger);
    assert.deepStrictEqual(firstResult._tag, "Some");
    if (firstResult._tag === "Some") assert.deepStrictEqual(firstResult.value, 42);
  }),
);
