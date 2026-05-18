import { Effect, Layer } from "effect";
import { ClockService } from "@/infra/clock.ts";

export interface AppRuntimeShape {
  readonly startedAt: Date;
}

export class AppRuntime extends Effect.Service<AppRuntime>()("@bakarr/api/AppRuntime", {
  effect: Effect.gen(function* () {
    const clock = yield* ClockService;
    const millis = yield* clock.currentTimeMillis;
    return { startedAt: new Date(millis) };
  }),
}) {
  static test(startedAt: Date) {
    return Layer.succeed(AppRuntime, AppRuntime.make({ startedAt }));
  }
}
