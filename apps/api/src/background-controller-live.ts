import { Effect, Layer } from "effect";

import { BackgroundTaskRunner } from "@/background-task-runner.ts";
import {
  BackgroundWorkerController,
  makeBackgroundWorkerController,
} from "@/background-controller-core.ts";
import { makeBackgroundWorkerSpawner } from "@/background-workers.ts";
import { BackgroundWorkerMonitor } from "@/background-monitor.ts";

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const monitor = yield* BackgroundWorkerMonitor;
  const taskRunner = yield* BackgroundTaskRunner;
  const spawnWorkers = makeBackgroundWorkerSpawner({
    monitor,
    taskRunner,
  });

  const controller = yield* makeBackgroundWorkerController({
    spawnWorkers,
  });

  yield* Effect.addFinalizer(() => controller.stop());

  return controller;
});

export const BackgroundWorkerControllerLive = Layer.scoped(
  BackgroundWorkerController,
  makeBackgroundWorkerControllerLive,
);
