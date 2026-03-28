import { Effect, Layer } from "effect";

import { spawnWorkersFromConfig } from "./background-workers.ts";
import {
  BackgroundWorkerController,
  makeBackgroundWorkerController,
} from "./background-controller-core.ts";
import { AnimeMutationService } from "./features/anime/service.ts";
import { ClockService } from "./lib/clock.ts";
import { EventBus } from "./features/events/event-bus.ts";
import { BackgroundWorkerMonitor } from "./background-monitor.ts";
import { DownloadLifecycleService } from "./features/operations/worker-services.ts";
import { LibraryScanService } from "./features/operations/worker-services.ts";
import { SearchWorkerService } from "./features/operations/worker-services.ts";

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const animeService = yield* AnimeMutationService;
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const monitor = yield* BackgroundWorkerMonitor;
  const downloadLifecycleService = yield* DownloadLifecycleService;
  const libraryService = yield* LibraryScanService;
  const searchWorkerService = yield* SearchWorkerService;

  const controller = yield* makeBackgroundWorkerController({
    spawnWorkers: (scope, config) =>
      spawnWorkersFromConfig(
        {
          animeService,
          clock,
          downloadLifecycleService,
          eventBus,
          libraryService,
          monitor,
          searchWorkerService,
        },
        scope,
        config,
      ),
  });

  yield* Effect.addFinalizer(() => controller.stop());

  return controller;
});

export const BackgroundWorkerControllerLive = Layer.scoped(
  BackgroundWorkerController,
  makeBackgroundWorkerControllerLive,
);
