import { assert, it } from "@effect/vitest";
import { Effect, Result, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";

import {
  ExternalCallError,
  ExternalCallPolicy,
  ExternalCallSemaphores,
  makeExternalCall,
} from "@/infra/effect/retry.ts";

class TestFailureError extends Error {
  readonly _tag = "TestFailureError";
}

const TestExternalCallLayer = Layer.mergeAll(
  ExternalCallPolicy.layer,
  ExternalCallSemaphores.layer,
);

it.effect("tryExternal retries transient failures", () =>
  Effect.gen(function* () {
    let attempts = 0;
    const externalCall = yield* makeExternalCall();

    const fiber = yield* externalCall
      .tryExternal("test.retry", () => {
        attempts += 1;

        if (attempts < 3) {
          throw new Error("transient");
        }

        return Promise.resolve("ok");
      })
      .pipe(Effect.forkChild);

    yield* TestClock.adjust("1 second");

    const result = yield* Fiber.join(fiber);

    assert.deepStrictEqual(result, "ok");
    assert.deepStrictEqual(attempts, 3);
  }).pipe(Effect.provide(TestExternalCallLayer)),
);

it.effect("tryExternal wraps timeout failures as ExternalCallError", () =>
  Effect.gen(function* () {
    const externalCall = yield* makeExternalCall();
    const fiber = yield* externalCall
      .tryExternal("test.timeout", async (signal) => {
        signal.throwIfAborted();
        await new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });

        return "never";
      })
      .pipe(Effect.result, Effect.forkChild);

    yield* TestClock.adjust("31 seconds");

    const result = yield* Fiber.join(fiber);

    assert.ok(Result.isFailure(result));
    assert.ok(result.failure instanceof ExternalCallError);
  }).pipe(Effect.provide(TestExternalCallLayer)),
);

it.effect("tryExternalEffect does not retry non-idempotent failures", () =>
  Effect.gen(function* () {
    let attempts = 0;
    const externalCall = yield* makeExternalCall();

    const result = yield* externalCall
      .tryExternalEffect(
        "test.non-idempotent",
        Effect.sync(() => {
          attempts += 1;
        }).pipe(Effect.andThen(Effect.fail(new TestFailureError()))),
        { idempotent: false },
      )
      .pipe(Effect.result);

    assert.ok(Result.isFailure(result));
    assert.ok(result.failure instanceof ExternalCallError);
    assert.deepStrictEqual(result.failure.operation, "test.non-idempotent");
    assert.deepStrictEqual(attempts, 1);
  }).pipe(Effect.provide(TestExternalCallLayer)),
);

it.effect("tryExternalEffect retries only when isRetryableError returns true", () =>
  Effect.gen(function* () {
    let attempts = 0;
    const externalCall = yield* makeExternalCall();

    const result = yield* externalCall
      .tryExternalEffect(
        "test.non-retryable",
        Effect.sync(() => {
          attempts += 1;
        }).pipe(
          Effect.andThen(
            Effect.fail(
              new ExternalCallError({
                cause: new Error("hard fail"),
                message: "hard fail",
                operation: "test.non-retryable",
              }),
            ),
          ),
        ),
        { isRetryableError: () => false },
      )
      .pipe(Effect.result);

    assert.ok(Result.isFailure(result));
    assert.deepStrictEqual(attempts, 1);
  }).pipe(Effect.provide(TestExternalCallLayer)),
);
