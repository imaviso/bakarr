import * as TestClock from "effect/testing/TestClock";
import { Effect } from "effect";
import { assert, it } from "@effect/vitest";

import { AuthRateLimitedError } from "@/features/auth/errors.ts";

import {
  makeLoginRateLimiter,
  MAX_CONSECUTIVE_LOGIN_FAILURES,
  MAX_GLOBAL_CONSECUTIVE_LOGIN_FAILURES,
  type LoginRateLimiterShape,
} from "@/features/auth/login-rate-limiter.ts";

const CLIENT_A = "203.0.113.9";
const CLIENT_B = "203.0.113.10";

const failTimes = (limiter: LoginRateLimiterShape, clientKey: string, times: number) =>
  Effect.gen(function* () {
    for (let index = 0; index < times; index++) {
      yield* limiter.recordFailure(clientKey);
    }
  });

it.effect("allows attempts below the failure threshold", () =>
  Effect.gen(function* () {
    const limiter = yield* makeLoginRateLimiter();

    yield* failTimes(limiter, CLIENT_A, MAX_CONSECUTIVE_LOGIN_FAILURES - 1);

    yield* limiter.rejectWhileLocked(CLIENT_A);
  }),
);

it.effect("locks after the configured consecutive failures and unlocks after cooldown", () =>
  Effect.gen(function* () {
    const limiter = yield* makeLoginRateLimiter();

    yield* failTimes(limiter, CLIENT_A, MAX_CONSECUTIVE_LOGIN_FAILURES);

    const locked = yield* Effect.result(limiter.rejectWhileLocked(CLIENT_A));

    assert.deepStrictEqual(locked._tag, "Failure");
    if (locked._tag === "Failure") {
      assert.ok(locked.failure instanceof AuthRateLimitedError);
      assert.deepStrictEqual(locked.failure.retryAfterMs, 1_000);
    }

    yield* TestClock.adjust("999 millis");
    const stillLocked = yield* Effect.result(limiter.rejectWhileLocked(CLIENT_A));
    assert.deepStrictEqual(stillLocked._tag, "Failure");

    yield* TestClock.adjust("1 millis");
    yield* limiter.rejectWhileLocked(CLIENT_A);
  }),
);

it.effect("one client's failures do not lock another client", () =>
  Effect.gen(function* () {
    const limiter = yield* makeLoginRateLimiter();

    yield* failTimes(limiter, CLIENT_A, MAX_CONSECUTIVE_LOGIN_FAILURES * 3);

    const lockedA = yield* Effect.result(limiter.rejectWhileLocked(CLIENT_A));
    assert.deepStrictEqual(lockedA._tag, "Failure");

    yield* limiter.rejectWhileLocked(CLIENT_B);
  }),
);

it.effect("global backstop locks only after far more distributed failures", () =>
  Effect.gen(function* () {
    const limiter = yield* makeLoginRateLimiter();
    let failures = 0;

    // Rotate clients so no single per-client counter reaches its threshold.
    while (failures < MAX_CONSECUTIVE_LOGIN_FAILURES * 2) {
      yield* limiter.recordFailure(`203.0.113.${failures}`);
      failures += 1;
    }

    yield* limiter.rejectWhileLocked(CLIENT_A);

    while (failures < MAX_GLOBAL_CONSECUTIVE_LOGIN_FAILURES) {
      yield* limiter.recordFailure(`203.0.113.${failures}`);
      failures += 1;
    }

    const lockedGlobal = yield* Effect.result(limiter.rejectWhileLocked(CLIENT_A));
    assert.deepStrictEqual(lockedGlobal._tag, "Failure");
  }),
);

it.effect("success resets the failure counter", () =>
  Effect.gen(function* () {
    const limiter = yield* makeLoginRateLimiter();

    yield* failTimes(limiter, CLIENT_A, MAX_CONSECUTIVE_LOGIN_FAILURES);
    yield* TestClock.adjust("1 second");

    yield* limiter.reset(CLIENT_A);
    yield* failTimes(limiter, CLIENT_A, MAX_CONSECUTIVE_LOGIN_FAILURES - 1);

    yield* limiter.rejectWhileLocked(CLIENT_A);
  }),
);

it.effect("cooldown grows exponentially across repeated lockouts", () =>
  Effect.gen(function* () {
    const limiter = yield* makeLoginRateLimiter();

    yield* failTimes(limiter, CLIENT_A, MAX_CONSECUTIVE_LOGIN_FAILURES);
    let locked = yield* Effect.result(limiter.rejectWhileLocked(CLIENT_A));
    assert.deepStrictEqual(locked._tag === "Failure" && locked.failure.retryAfterMs, 1_000);

    // Cooldown elapses; another failure re-locks with a doubled cooldown.
    yield* TestClock.adjust("1 second");
    yield* limiter.recordFailure(CLIENT_A);

    locked = yield* Effect.result(limiter.rejectWhileLocked(CLIENT_A));
    assert.deepStrictEqual(locked._tag === "Failure" && locked.failure.retryAfterMs, 2_000);

    yield* TestClock.adjust("2 seconds");
    yield* limiter.recordFailure(CLIENT_A);

    locked = yield* Effect.result(limiter.rejectWhileLocked(CLIENT_A));
    assert.deepStrictEqual(locked._tag === "Failure" && locked.failure.retryAfterMs, 4_000);
  }),
);
