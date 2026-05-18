import { Clock, Effect } from "effect";

export interface ClockServiceShape {
  readonly currentMonotonicMillis: Effect.Effect<number>;
  readonly currentTimeMillis: Effect.Effect<number>;
}

export class ClockService extends Effect.Service<ClockService>()("@bakarr/lib/ClockService", {
  sync: () => ({
    currentMonotonicMillis: Effect.fn("ClockService.currentMonotonicMillis")(() =>
      Effect.sync(() => performance.now()),
    )(),
    currentTimeMillis: Effect.fn("ClockService.currentTimeMillis")(() => Clock.currentTimeMillis)(),
  }),
}) {}

export const ClockServiceLive = ClockService.Default;

export function isoStringFromMillis(millis: number): string {
  return new Date(millis).toISOString();
}

export const nowIsoFromClock = Effect.fn("Clock.nowIsoFromClock")(
  (clock: ClockServiceShape): Effect.Effect<string> =>
    Effect.map(clock.currentTimeMillis, isoStringFromMillis),
);
