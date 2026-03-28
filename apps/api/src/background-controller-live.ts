import { Effect, Layer } from "effect";

import { spawnWorkersFromConfig } from "./background-workers.ts";
import {
  BackgroundWorkerController,
  makeBackgroundWorkerController,
} from "./background-controller-core.ts";
import { makeBackgroundWorkerDependencies } from "./background-worker-dependencies.ts";

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const backgroundWorkerServices = yield* makeBackgroundWorkerDependencies;

  const controller = yield* makeBackgroundWorkerController({
    spawnWorkers: (scope, config) =>
      spawnWorkersFromConfig(backgroundWorkerServices, scope, config),
  });

  yield* Effect.addFinalizer(() => controller.stop());

  return controller;
});

export const BackgroundWorkerControllerLive = Layer.scoped(
  BackgroundWorkerController,
  makeBackgroundWorkerControllerLive,
);
