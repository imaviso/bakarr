import { assert, it } from "@effect/vitest";
import { Effect, TestClock } from "effect";

import { AuthRateLimitedError } from "@/features/auth/errors.ts";
import {
  makeLoginRateLimiter,
  MAX_CONSECUTIVE_LOGIN_FAILURES,
  type LoginRateLimiterShape,
} from "@/features/auth/login-rate-limiter.ts";

const failTimes = (limiter: LoginRateLimiterShape, times: number) =>
  Effect.gen(function* () {
    for (let index = 0; index < times; index++) {
      yield* limiter.recordFailure();
    }
  });

it.effect("allows attempts below the failure threshold", () =>
  Effect.gen(function* () {
    const limiter = yield* makeLoginRateLimiter();

    yield* failTimes(limiter, MAX_CONSECUTIVE_LOGIN_FAILURES - 1);

    yield* limiter.rejectWhileLocked();
  }),
);

it.effect("locks after the configured consecutive failures and unlocks after cooldown", () =>
  Effect.gen(function* () {
    const limiter = yield* makeLoginRateLimiter();

    yield* failTimes(limiter, MAX_CONSECUTIVE_LOGIN_FAILURES);

    const locked = yield* Effect.either(limiter.rejectWhileLocked());

    assert.deepStrictEqual(locked._tag, "Left");
    if (locked._tag === "Left") {
      assert.ok(locked.left instanceof AuthRateLimitedError);
      assert.deepStrictEqual(locked.left.retryAfterMs, 1_000);
    }

    yield* TestClock.adjust("999 millis");
    const stillLocked = yield* Effect.either(limiter.rejectWhileLocked());
    assert.deepStrictEqual(stillLocked._tag, "Left");

    yield* TestClock.adjust("1 millis");
    yield* limiter.rejectWhileLocked();
  }),
);

it.effect("success resets the failure counter", () =>
  Effect.gen(function* () {
    const limiter = yield* makeLoginRateLimiter();

    yield* failTimes(limiter, MAX_CONSECUTIVE_LOGIN_FAILURES);
    yield* TestClock.adjust("1 second");

    yield* limiter.reset();
    yield* failTimes(limiter, MAX_CONSECUTIVE_LOGIN_FAILURES - 1);

    yield* limiter.rejectWhileLocked();
  }),
);

it.effect("cooldown grows exponentially across repeated lockouts", () =>
  Effect.gen(function* () {
    const limiter = yield* makeLoginRateLimiter();

    yield* failTimes(limiter, MAX_CONSECUTIVE_LOGIN_FAILURES);
    let locked = yield* Effect.either(limiter.rejectWhileLocked());
    assert.deepStrictEqual(locked._tag === "Left" && locked.left.retryAfterMs, 1_000);

    // Cooldown elapses; another failure re-locks with a doubled cooldown.
    yield* TestClock.adjust("1 second");
    yield* limiter.recordFailure();

    locked = yield* Effect.either(limiter.rejectWhileLocked());
    assert.deepStrictEqual(locked._tag === "Left" && locked.left.retryAfterMs, 2_000);

    yield* TestClock.adjust("2 seconds");
    yield* limiter.recordFailure();

    locked = yield* Effect.either(limiter.rejectWhileLocked());
    assert.deepStrictEqual(locked._tag === "Left" && locked.left.retryAfterMs, 4_000);
  }),
);
