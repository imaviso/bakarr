import { Clock, Context, Effect, Layer } from "effect";

export interface ClockServiceShape {
  readonly currentMonotonicMillis: Effect.Effect<number>;
  readonly currentTimeMillis: Effect.Effect<number>;
}

export class ClockService extends Context.Tag("@bakarr/lib/ClockService")<
  ClockService,
  ClockServiceShape
>() {}

export const ClockServiceLive = Layer.succeed(ClockService, {
  currentMonotonicMillis: Effect.sync(() => performance.now()),
  currentTimeMillis: Clock.currentTimeMillis,
});

export function isoStringFromMillis(millis: number): string {
  return new Date(millis).toISOString();
}

export function nowIsoFromClock(clock: ClockServiceShape): Effect.Effect<string> {
  return Effect.map(clock.currentTimeMillis, isoStringFromMillis);
}

export const { currentTimeMillis } = Clock;
export const currentMonotonicMillis: Effect.Effect<number> = Effect.sync(() => performance.now());

/**
 * Effect-based ISO timestamp using the Effect Clock.
 * Use `yield* nowIso` in Effect generators.
 * Deterministic under TestClock.
 */
export const nowIso: Effect.Effect<string> = Effect.map(currentTimeMillis, (millis) =>
  new Date(millis).toISOString(),
);

export function currentTimeMillisSync(): number {
  return Date.now();
}

export function currentMonotonicMillisSync(): number {
  return performance.now();
}

export function currentDateSync(): Date {
  return new Date(currentTimeMillisSync());
}

/**
 * Sync ISO timestamp for pure/non-Effect code only (DTO assembly, parsing).
 * Prefer `nowIso` in service/orchestration code.
 */
export function nowIsoSync(): string {
  return new Date().toISOString();
}
