import { Context, DateTime, Effect, Layer } from "effect";

export interface AppRuntimeShape {
  readonly startedAt: Date;
}

export class AppRuntime extends Context.Service<AppRuntime, AppRuntimeShape>()(
  "@bakarr/api/AppRuntime",
) {
  static test(startedAt: Date) {
    return Layer.succeed(AppRuntime, { startedAt });
  }
  static readonly layer = Layer.effect(
    AppRuntime,
    Effect.gen(function* () {
      const startedAt = yield* DateTime.nowAsDate;
      return { startedAt };
    }),
  );
}
