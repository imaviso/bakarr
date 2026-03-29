import { Effect, Layer } from "effect";

import { spawnWorkersFromConfig } from "./background-workers.ts";
import {
  BackgroundWorkerController,
  makeBackgroundWorkerController,
} from "./background-controller-core.ts";
import { AnimeMutationService } from "./features/anime/mutation-service.ts";
import { ClockService } from "./lib/clock.ts";
import { EventBus } from "./features/events/event-bus.ts";
import { BackgroundWorkerMonitor } from "./background-monitor.ts";
import { CatalogDownloadService } from "./features/operations/catalog-service-tags.ts";
import { CatalogLibraryService } from "./features/operations/catalog-library-service.ts";
import { SearchWorkflow } from "./features/operations/search-service-tags.ts";

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const animeService = yield* AnimeMutationService;
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const monitor = yield* BackgroundWorkerMonitor;
  const catalogDownloadService = yield* CatalogDownloadService;
  const catalogLibraryService = yield* CatalogLibraryService;
  const searchWorkflow = yield* SearchWorkflow;

  const controller = yield* makeBackgroundWorkerController({
    spawnWorkers: (scope, config) =>
      spawnWorkersFromConfig(
        {
          animeService,
          catalogDownloadService,
          catalogLibraryService,
          clock,
          eventBus,
          monitor,
          searchWorkflow,
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
