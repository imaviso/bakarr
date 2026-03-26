import { Context, Effect, Layer } from "effect";

import type { Config } from "../../../packages/shared/src/index.ts";
import type { DatabaseError } from "./db/database.ts";
import { ClockService } from "./lib/clock.ts";
import { makeReloadableScopedController } from "./lib/reloadable-scoped-controller.ts";
import { EventBus } from "./features/events/event-bus.ts";
import { AnimeService } from "./features/anime/service.ts";
import {
  DownloadService,
  LibraryService,
  RssService,
} from "./features/operations/service-contract.ts";
import { BackgroundWorkerMonitor } from "./background-monitor.ts";
import {
  spawnWorkersFromConfig,
  type BackgroundWorkerSpawner,
  type WorkersDeps,
} from "./background-workers.ts";

export interface BackgroundWorkerControllerShape {
  readonly isStarted: () => Effect.Effect<boolean>;
  readonly start: (config: Config) => Effect.Effect<void, DatabaseError>;
  readonly reload: (config: Config) => Effect.Effect<void, DatabaseError>;
  readonly stop: () => Effect.Effect<void>;
}

export class BackgroundWorkerController extends Context.Tag(
  "@bakarr/api/BackgroundWorkerController",
)<BackgroundWorkerController, BackgroundWorkerControllerShape>() {}

export const makeBackgroundWorkerController = Effect.fn(
  "Background.makeBackgroundWorkerController",
)(function* (options: { readonly spawnWorkers: BackgroundWorkerSpawner }) {
  return yield* makeReloadableScopedController({
    spawn: options.spawnWorkers,
  });
});

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const monitor = yield* BackgroundWorkerMonitor;
  const animeService = yield* AnimeService;
  const downloadService = yield* DownloadService;
  const libraryService = yield* LibraryService;
  const rssService = yield* RssService;

  const deps: WorkersDeps = {
    animeService,
    clock,
    eventBus,
    monitor,
    downloadService,
    libraryService,
    rssService,
  };

  const spawnWorkers: BackgroundWorkerSpawner = (scope, config) =>
    spawnWorkersFromConfig(scope, config, deps);

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
