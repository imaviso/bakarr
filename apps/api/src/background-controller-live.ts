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
import { CatalogWorkflow } from "./features/operations/catalog-service-tags.ts";
import { SearchWorkflow } from "./features/operations/search-service-tags.ts";

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const animeService = yield* AnimeMutationService;
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const monitor = yield* BackgroundWorkerMonitor;
  const catalogWorkflow = yield* CatalogWorkflow;
  const searchWorkflow = yield* SearchWorkflow;

  const controller = yield* makeBackgroundWorkerController({
    spawnWorkers: (scope, config) =>
      spawnWorkersFromConfig(
        {
          animeService,
          catalogWorkflow,
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
