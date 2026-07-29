import { Context, DateTime, Effect, Layer } from "effect";

export interface AppRuntimeShape {
  readonly startedAt: Date;
}

export class AppRuntime extends Context.Service<AppRuntime>()("@bakarr/api/AppRuntime", {
  make: Effect.gen(function* () {
    const startedAt = yield* DateTime.nowAsDate;
    return { startedAt };
  }),
}) {
  static readonly layer = Layer.effect(AppRuntime, AppRuntime.make);

  static test(startedAt: Date) {
    return Layer.succeed(AppRuntime, { startedAt });
  }
}
