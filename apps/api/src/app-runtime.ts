import { Context, Effect, Layer } from "effect";
import { ClockService } from "@/lib/clock.ts";

export interface AppRuntimeShape {
  readonly startedAt: Date;
}

export class AppRuntime extends Context.Tag("@bakarr/api/AppRuntime")<
  AppRuntime,
  AppRuntimeShape
>() {
  static readonly Live = Layer.effect(
    AppRuntime,
    Effect.gen(function* () {
      const clock = yield* ClockService;
      const millis = yield* clock.currentTimeMillis;
      return { startedAt: new Date(millis) };
    }),
  );

  static test(startedAt: Date) {
    return Layer.succeed(AppRuntime, { startedAt });
  }
}
