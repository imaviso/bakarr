import { Effect } from "effect";

import { BackgroundWorkerMonitor } from "./background-monitor.ts";
import { ClockService } from "./lib/clock.ts";
import { AnimeMutationService } from "./features/anime/service.ts";
import {
  CatalogOrchestration,
  SearchOrchestration,
} from "./features/operations/operations-orchestration.ts";
import { EventBus } from "./features/events/event-bus.ts";
import type { BackgroundWorkerDependencies } from "./background-workers.ts";

export const makeBackgroundWorkerDependencies = Effect.gen(function* () {
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const monitor = yield* BackgroundWorkerMonitor;
  const animeService = yield* AnimeMutationService;
  const catalogService = yield* CatalogOrchestration;
  const searchService = yield* SearchOrchestration;

  return {
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
});
