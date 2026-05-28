import { Clock, DateTime, Effect } from "effect";

export const currentTimeMillis = Clock.currentTimeMillis;

export const currentTimeNanos = Clock.currentTimeNanos;

export const nowIso = Effect.fn("Time.nowIso")(function* () {
  const now = yield* DateTime.nowAsDate;
  return now.toISOString();
});
