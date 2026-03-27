import { Effect, Layer } from "effect";

import { ClockService } from "./lib/clock.ts";
import { spawnWorkersFromConfig, type BackgroundWorkerDependencies } from "./background-workers.ts";
import { BackgroundWorkerMonitor } from "./background-monitor.ts";
import { EventBus } from "./features/events/event-bus.ts";
import { AnimeMutationService } from "./features/anime/service.ts";
import {
  CatalogOrchestration,
  SearchOrchestration,
} from "./features/operations/operations-orchestration.ts";
import {
  BackgroundWorkerController,
  makeBackgroundWorkerController,
} from "./background-controller-core.ts";

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const monitor = yield* BackgroundWorkerMonitor;
  const animeService = yield* AnimeMutationService;
  const catalogService = yield* CatalogOrchestration;
  const searchService = yield* SearchOrchestration;

  const backgroundWorkerServices = {
    animeService,
    clock,
    downloadControlService: catalogService,
    downloadStatusService: catalogService,
    downloadTriggerService: searchService,
    eventBus,
    libraryService: catalogService,
    monitor,
    rssService: searchService,
  } satisfies BackgroundWorkerDependencies;

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
