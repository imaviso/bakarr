import { Effect, Layer } from "effect";

import { BackgroundWorkerJobs } from "@/background-worker-jobs.ts";
import {
  BackgroundWorkerController,
  makeBackgroundWorkerController,
} from "@/background-controller-core.ts";
import { makeBackgroundWorkerSpawner } from "@/background-workers.ts";
import { ClockService } from "@/lib/clock.ts";
import { BackgroundWorkerMonitor } from "@/background-monitor.ts";

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const clock = yield* ClockService;
  const monitor = yield* BackgroundWorkerMonitor;
  const jobs = yield* BackgroundWorkerJobs;
  const spawnWorkers = makeBackgroundWorkerSpawner({
    clock,
    jobs,
    monitor,
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
