import { assert, assertEquals, it } from "../test/vitest.ts";
import { Effect, Either, Fiber, TestClock } from "effect";

import { ExternalCallError, tryExternal } from "./effect-retry.ts";

it.effect("tryExternal retries transient failures", () =>
  Effect.gen(function* () {
  let attempts = 0;

    const fiber = yield* tryExternal("test.retry", () => {
      attempts += 1;

      if (attempts < 3) {
        throw new Error("transient");
      }

      return Promise.resolve("ok");
    })().pipe(Effect.fork);

    yield* TestClock.adjust("1 second");

    const result = yield* Fiber.join(fiber);

    assertEquals(result, "ok");
    assertEquals(attempts, 3);
  })
);

it.effect("tryExternal wraps timeout failures as ExternalCallError", () =>
  Effect.gen(function* () {
    const fiber = yield* tryExternal("test.timeout", async (signal) => {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 11_000);

        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(new Error("aborted"));
          },
          { once: true },
        );
      });

      return "never";
    })().pipe(Effect.either, Effect.fork);

    yield* TestClock.adjust("31 seconds");

    const result = yield* Fiber.join(fiber);

    assert(Either.isLeft(result));
    assert(result.left instanceof ExternalCallError);
  })
);
