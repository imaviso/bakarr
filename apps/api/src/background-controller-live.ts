import { Effect, Layer } from "effect";

import { spawnWorkersFromConfig } from "@/background-workers.ts";
import {
  BackgroundWorkerController,
  makeBackgroundWorkerController,
} from "@/background-controller-core.ts";
import { AnimeMetadataRefreshService } from "@/features/anime/metadata-refresh-service.ts";
import { ClockService } from "@/lib/clock.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { BackgroundWorkerMonitor } from "@/background-monitor.ts";
import { CatalogDownloadService } from "@/features/operations/catalog-download-orchestration.ts";
import { CatalogLibraryScanService } from "@/features/operations/catalog-library-scan-support.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search-missing-support.ts";
import { SearchBackgroundRssService } from "@/features/operations/background-search-rss-support.ts";

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const monitor = yield* BackgroundWorkerMonitor;
  const catalogDownloadService = yield* CatalogDownloadService;
  const catalogLibraryScanService = yield* CatalogLibraryScanService;
  const metadataRefreshService = yield* AnimeMetadataRefreshService;
  const searchBackgroundMissingService = yield* SearchBackgroundMissingService;
  const searchBackgroundRssService = yield* SearchBackgroundRssService;

  const controller = yield* makeBackgroundWorkerController({
    spawnWorkers: (scope, config) =>
      spawnWorkersFromConfig(scope, config).pipe(
        Effect.provideService(AnimeMetadataRefreshService, metadataRefreshService),
        Effect.provideService(CatalogDownloadService, catalogDownloadService),
        Effect.provideService(CatalogLibraryScanService, catalogLibraryScanService),
        Effect.provideService(ClockService, clock),
        Effect.provideService(EventBus, eventBus),
        Effect.provideService(BackgroundWorkerMonitor, monitor),
        Effect.provideService(SearchBackgroundMissingService, searchBackgroundMissingService),
        Effect.provideService(SearchBackgroundRssService, searchBackgroundRssService),
      ),
  });

  yield* Effect.addFinalizer(() => controller.stop());

  return controller;
});

export const BackgroundWorkerControllerLive = Layer.scoped(
  BackgroundWorkerController,
  makeBackgroundWorkerControllerLive,
);
