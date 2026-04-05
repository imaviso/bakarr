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
  currentMonotonicMillis: Effect.sync(() => performance.now()).pipe(
    Effect.withSpan("ClockService.currentMonotonicMillis"),
  ),
  currentTimeMillis: Clock.currentTimeMillis.pipe(
    Effect.withSpan("ClockService.currentTimeMillis"),
  ),
});

export function isoStringFromMillis(millis: number): string {
  return new Date(millis).toISOString();
}

export const nowIsoFromClock = Effect.fn("Clock.nowIsoFromClock")(
  (clock: ClockServiceShape): Effect.Effect<string> =>
    Effect.map(clock.currentTimeMillis, isoStringFromMillis),
);
