import { Context, Effect, Layer } from "effect";

import type { Config } from "../../../packages/shared/src/index.ts";
import { DatabaseError } from "./db/database.ts";
import { BackgroundWorkerController } from "./background-controller.ts";

export interface BackgroundWorkerRuntimeControlShape {
  readonly isStarted: () => Effect.Effect<boolean>;
  readonly start: (config: Config) => Effect.Effect<void, DatabaseError>;
  readonly reload: (config: Config) => Effect.Effect<void, DatabaseError>;
  readonly stop: () => Effect.Effect<void>;
}

export class BackgroundWorkerRuntimeControl extends Context.Tag(
  "@bakarr/api/BackgroundWorkerRuntimeControl",
)<BackgroundWorkerRuntimeControl, BackgroundWorkerRuntimeControlShape>() {}

const makeBackgroundWorkerRuntimeControl = Effect.gen(function* () {
  const controller = yield* BackgroundWorkerController;

  const isStarted = Effect.fn("BackgroundWorkerRuntimeControl.isStarted")(function* () {
    return yield* controller.isStarted();
  });

  const start = Effect.fn("BackgroundWorkerRuntimeControl.start")(function* (config: Config) {
    return yield* controller.start(config);
  });

  const reload = Effect.fn("BackgroundWorkerRuntimeControl.reload")(function* (config: Config) {
    return yield* controller.reload(config);
  });

  const stop = Effect.fn("BackgroundWorkerRuntimeControl.stop")(function* () {
    return yield* controller.stop();
  });

  return {
    isStarted,
    reload,
    start,
    stop,
  } satisfies BackgroundWorkerRuntimeControlShape;
});

export const BackgroundWorkerRuntimeControlLive = Layer.effect(
  BackgroundWorkerRuntimeControl,
  makeBackgroundWorkerRuntimeControl,
);
