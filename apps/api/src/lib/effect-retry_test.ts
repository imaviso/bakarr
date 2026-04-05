import { assert, it } from "@effect/vitest";
import { Effect, Either, Fiber, TestClock } from "effect";

import type { ClockServiceShape } from "@/lib/clock.ts";
import { ExternalCallError, makeTryExternal, makeTryExternalEffect } from "@/lib/effect-retry.ts";

class TestFailureError extends Error {
  readonly _tag = "TestFailureError";
}

it.effect("tryExternal retries transient failures", () =>
  Effect.gen(function* () {
    let attempts = 0;
    const tryExternal = makeTryExternal(testClock);

    const fiber = yield* tryExternal("test.retry", () => {
      attempts += 1;

      if (attempts < 3) {
        throw new Error("transient");
      }

      return Promise.resolve("ok");
    })().pipe(Effect.fork);

    yield* TestClock.adjust("1 second");

    const result = yield* Fiber.join(fiber);

    assert.deepStrictEqual(result, "ok");
    assert.deepStrictEqual(attempts, 3);
  }),
);

it.effect("tryExternal wraps timeout failures as ExternalCallError", () =>
  Effect.gen(function* () {
    const tryExternal = makeTryExternal(testClock);
    const fiber = yield* tryExternal("test.timeout", async (signal) => {
      signal.throwIfAborted();
      await new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });

      return "never";
    })().pipe(Effect.either, Effect.fork);

    yield* TestClock.adjust("31 seconds");

    const result = yield* Fiber.join(fiber);

    assert.ok(Either.isLeft(result));
    assert.ok(result.left instanceof ExternalCallError);
  }),
);

it.effect("tryExternalEffect does not retry non-idempotent failures", () =>
  Effect.gen(function* () {
    let attempts = 0;
    const tryExternalEffect = makeTryExternalEffect(testClock);

    const result = yield* tryExternalEffect(
      "test.non-idempotent",
      Effect.sync(() => {
        attempts += 1;
      }).pipe(Effect.zipRight(Effect.fail(new TestFailureError()))),
      { idempotent: false },
    )().pipe(Effect.either);

    assert.ok(Either.isLeft(result));
    assert.ok(result.left instanceof ExternalCallError);
    assert.deepStrictEqual(result.left.operation, "test.non-idempotent");
    assert.deepStrictEqual(attempts, 1);
  }),
);

const testClock: ClockServiceShape = {
  currentMonotonicMillis: TestClock.currentTimeMillis,
  currentTimeMillis: TestClock.currentTimeMillis,
};
