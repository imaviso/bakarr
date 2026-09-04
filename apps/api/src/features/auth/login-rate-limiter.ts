// oxlint-disable typescript-eslint/consistent-return -- generator early-returns mirror the repo convention in config-activation.ts

import { Clock, Effect, Ref } from "effect";
import { AuthRateLimitedError } from "@/features/auth/errors.ts";

export const MAX_CONSECUTIVE_LOGIN_FAILURES = 5;

/**
 * Backstop for attacks spread across many source addresses that would never
 * trip the per-client counter. Higher than the per-client threshold so one
 * noisy peer cannot lock the sole admin out.
 */
export const MAX_GLOBAL_CONSECUTIVE_LOGIN_FAILURES = 20;

const BASE_COOLDOWN_MS = 1_000;
const MAX_COOLDOWN_MS = 5 * 60_000;
/** Counters older than this start fresh, so lockouts cannot persist forever. */
const FAILURE_DECAY_MS = 15 * 60_000;
const MAX_TRACKED_CLIENTS = 256;

const GLOBAL_KEY = "\0global";

interface LoginRateLimitState {
  readonly consecutiveFailures: number;
  readonly lockedUntilMs: number;
  readonly lastFailureAtMs: number;
}

const emptyState: LoginRateLimitState = {
  consecutiveFailures: 0,
  lockedUntilMs: 0,
  lastFailureAtMs: 0,
};

export interface LoginRateLimiterShape {
  /** Fails with AuthRateLimitedError while the client or the global backstop is locked out. */
  readonly rejectWhileLocked: (clientKey: string) => Effect.Effect<void, AuthRateLimitedError>;
  /** Records one failed attempt for the client and the global backstop. */
  readonly recordFailure: (clientKey: string) => Effect.Effect<void>;
  /** Clears the client's failure counter (call after a successful login). */
  readonly reset: (clientKey: string) => Effect.Effect<void>;
}

/**
 * Per-client login failure counters keyed by socket remote address, plus a
 * global backstop for distributed attempts. After
 * MAX_CONSECUTIVE_LOGIN_FAILURES consecutive failures, that client's attempts
 * are rejected until the cooldown elapses; each additional failure doubles the
 * cooldown (capped). Counters decay after FAILURE_DECAY_MS, so no lockout
 * outlives quiet time. Time comes from Effect.Clock so tests can use TestClock.
 * In-memory only — restart resets counters.
 */
export const makeLoginRateLimiter = Effect.fn("Auth.makeLoginRateLimiter")(function* () {
  const stateRef = yield* Ref.make(new Map<string, LoginRateLimitState>());

  const rejectWhileLocked = Effect.fn("Auth.rejectWhileLocked")(function* (clientKey: string) {
    const nowMs = yield* Clock.currentTimeMillis;
    const retryAfterMs = yield* Ref.modify(
      stateRef,
      (states): readonly [number, Map<string, LoginRateLimitState>] => {
        const client = states.get(clientKey) ?? emptyState;
        const global = states.get(GLOBAL_KEY) ?? emptyState;

        let retryAfter = 0;
        if (
          client.consecutiveFailures >= MAX_CONSECUTIVE_LOGIN_FAILURES &&
          nowMs < client.lockedUntilMs
        ) {
          retryAfter = Math.max(retryAfter, client.lockedUntilMs - nowMs);
        }
        if (
          global.consecutiveFailures >= MAX_GLOBAL_CONSECUTIVE_LOGIN_FAILURES &&
          nowMs < global.lockedUntilMs
        ) {
          retryAfter = Math.max(retryAfter, global.lockedUntilMs - nowMs);
        }

        return [retryAfter, states];
      },
    );

    if (retryAfterMs > 0) {
      return yield* new AuthRateLimitedError({
        message: "Too many failed login attempts; try again later",
        retryAfterMs,
      });
    }
  });

  const recordFailure = Effect.fn("Auth.recordLoginFailure")(function* (clientKey: string) {
    const nowMs = yield* Clock.currentTimeMillis;

    yield* Ref.update(stateRef, (states) => {
      const next = new Map(states);
      next.set(
        clientKey,
        bumpFailure(states.get(clientKey) ?? emptyState, nowMs, MAX_CONSECUTIVE_LOGIN_FAILURES),
      );
      next.set(
        GLOBAL_KEY,
        bumpFailure(
          states.get(GLOBAL_KEY) ?? emptyState,
          nowMs,
          MAX_GLOBAL_CONSECUTIVE_LOGIN_FAILURES,
        ),
      );
      pruneClients(next, nowMs);
      return next;
    });
  });

  const reset = Effect.fn("Auth.resetLoginFailures")(function* (clientKey: string) {
    yield* Ref.update(stateRef, (states) => {
      const next = new Map(states);
      next.delete(clientKey);
      return next;
    });
  });

  return { recordFailure, rejectWhileLocked, reset } satisfies LoginRateLimiterShape;
});

function bumpFailure(
  state: LoginRateLimitState,
  nowMs: number,
  threshold: number,
): LoginRateLimitState {
  const decayed = nowMs - state.lastFailureAtMs > FAILURE_DECAY_MS;
  const consecutiveFailures = decayed ? 1 : state.consecutiveFailures + 1;

  if (consecutiveFailures < threshold) {
    return { consecutiveFailures, lockedUntilMs: 0, lastFailureAtMs: nowMs };
  }

  const exponent = consecutiveFailures - threshold;
  const cooldownMs = Math.min(BASE_COOLDOWN_MS * 2 ** exponent, MAX_COOLDOWN_MS);

  return { consecutiveFailures, lockedUntilMs: nowMs + cooldownMs, lastFailureAtMs: nowMs };
}

function pruneClients(states: Map<string, LoginRateLimitState>, nowMs: number) {
  if (states.size <= MAX_TRACKED_CLIENTS) {
    return;
  }

  for (const [key, state] of states) {
    if (key === GLOBAL_KEY) {
      continue;
    }
    if (state.lockedUntilMs < nowMs && nowMs - state.lastFailureAtMs > FAILURE_DECAY_MS) {
      states.delete(key);
    }
  }

  // Fresh flood would still exceed cap (all entries recent). Evict oldest
  // by lastFailureAtMs so size cannot grow unbounded under distinct-IP spray.
  if (states.size <= MAX_TRACKED_CLIENTS) {
    return;
  }

  const candidates = [...states.entries()]
    .filter(([key]) => key !== GLOBAL_KEY)
    .toSorted((left, right) => left[1].lastFailureAtMs - right[1].lastFailureAtMs);

  for (const [key] of candidates) {
    if (states.size <= MAX_TRACKED_CLIENTS) {
      break;
    }
    states.delete(key);
  }
}
