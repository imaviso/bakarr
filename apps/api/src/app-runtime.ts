import { Context, Layer } from "effect";

export interface AppRuntimeShape {
  readonly startedAt: Date;
}

export class AppRuntime extends Context.Tag("@bakarr/api/AppRuntime")<
  AppRuntime,
  AppRuntimeShape
>() {
  static layer(startedAt = new Date()) {
    return Layer.succeed(AppRuntime, { startedAt });
  }
}

export function makeAppRuntimeLayer(startedAt = new Date()) {
  return AppRuntime.layer(startedAt);
}
