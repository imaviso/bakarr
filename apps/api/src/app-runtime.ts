import { Context, Effect, Layer } from "effect";
import { ClockService } from "@/lib/clock.ts";

export interface AppRuntimeShape {
  readonly startedAt: Date;
}

export class AppRuntime extends Context.Tag("@bakarr/api/AppRuntime")<
  AppRuntime,
  AppRuntimeShape
>() {
  static layer(startedAt?: Date) {
    return startedAt
      ? Layer.succeed(AppRuntime, { startedAt })
      : Layer.effect(
          AppRuntime,
          Effect.gen(function* () {
            const clock = yield* ClockService;
            const millis = yield* clock.currentTimeMillis;
            return {
              startedAt: new Date(millis),
            };
          }),
        );
  }
}
