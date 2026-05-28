import { DateTime, Effect, Layer } from "effect";

export interface AppRuntimeShape {
  readonly startedAt: Date;
}

export class AppRuntime extends Effect.Service<AppRuntime>()("@bakarr/api/AppRuntime", {
  effect: Effect.gen(function* () {
    const startedAt = yield* DateTime.nowAsDate;
    return { startedAt };
  }),
}) {
  static test(startedAt: Date) {
    return Layer.succeed(AppRuntime, AppRuntime.make({ startedAt }));
  }
}
