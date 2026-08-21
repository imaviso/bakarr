// oxlint-disable typescript-eslint/consistent-return -- generator early-returns mirror the repo convention in config-activation.ts
import { Clock, Effect, Ref } from "effect";

import { AuthRateLimitedError } from "@/features/auth/errors.ts";

export const MAX_CONSECUTIVE_LOGIN_FAILURES = 5;

const BASE_COOLDOWN_MS = 1_000;
const MAX_COOLDOWN_MS = 5 * 60_000;

interface LoginRateLimitState {
  readonly consecutiveFailures: number;
  readonly lockedUntilMs: number;
}

export interface LoginRateLimiterShape {
  /** Fails with AuthRateLimitedError while a lockout cooldown is active. */
  readonly rejectWhileLocked: () => Effect.Effect<void, AuthRateLimitedError>;
  /** Records one failed attempt; arms a lockout once the threshold is reached. */
  readonly recordFailure: () => Effect.Effect<void>;
  /** Clears the failure counter (call after a successful login). */
  readonly reset: () => Effect.Effect<void>;
}

/**
 * Global (single-user) login failure counter with exponential backoff.
 * After MAX_CONSECUTIVE_LOGIN_FAILURES consecutive failures, attempts are
 * rejected until the cooldown elapses; each additional failure doubles the
 * cooldown (capped). Time comes from Effect.Clock so tests can use TestClock.
 * In-memory only — restart resets counter. Acceptable for single-user LAN;
 * parallel burst can exceed threshold by at most one batch before lock arms.
 */
export const makeLoginRateLimiter = Effect.fn("Auth.makeLoginRateLimiter")(function* () {
  const stateRef = yield* Ref.make<LoginRateLimitState>({
    consecutiveFailures: 0,
    lockedUntilMs: 0,
  });

  const rejectWhileLocked = Effect.fn("Auth.rejectWhileLocked")(function* () {
    const nowMs = yield* Clock.currentTimeMillis;
    const shouldReject = yield* Ref.modify(
      stateRef,
      (state): readonly [boolean, LoginRateLimitState] => {
        if (state.consecutiveFailures < MAX_CONSECUTIVE_LOGIN_FAILURES) {
          return [false, state];
        }
        return [nowMs < state.lockedUntilMs, state];
      },
    );

    if (shouldReject) {
      const state = yield* Ref.get(stateRef);
      return yield* new AuthRateLimitedError({
        message: "Too many failed login attempts; try again later",
        retryAfterMs: state.lockedUntilMs - nowMs,
      });
    }
  });

  const recordFailure = Effect.fn("Auth.recordLoginFailure")(function* () {
    const nowMs = yield* Clock.currentTimeMillis;

    yield* Ref.update(stateRef, (state) => {
      const consecutiveFailures = state.consecutiveFailures + 1;

      if (consecutiveFailures < MAX_CONSECUTIVE_LOGIN_FAILURES) {
        return { consecutiveFailures, lockedUntilMs: 0 };
      }

      const exponent = consecutiveFailures - MAX_CONSECUTIVE_LOGIN_FAILURES;
      const cooldownMs = Math.min(BASE_COOLDOWN_MS * 2 ** exponent, MAX_COOLDOWN_MS);

      return { consecutiveFailures, lockedUntilMs: nowMs + cooldownMs };
    });
  });

  const reset = Effect.fn("Auth.resetLoginFailures")(function* () {
    yield* Ref.set(stateRef, { consecutiveFailures: 0, lockedUntilMs: 0 });
  });

  return { recordFailure, rejectWhileLocked, reset } satisfies LoginRateLimiterShape;
});
