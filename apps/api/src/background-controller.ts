import { Context, Effect, Layer } from "effect";

import type { Config } from "../../../packages/shared/src/index.ts";
import type { DatabaseError } from "./db/database.ts";
import { ClockService } from "./lib/clock.ts";
import { makeReloadableScopedController } from "./lib/reloadable-scoped-controller.ts";
import {
  spawnWorkersFromConfig,
  type BackgroundWorkerDependencies,
  type BackgroundWorkerSpawner,
} from "./background-workers.ts";
import { BackgroundWorkerMonitor } from "./background-monitor.ts";
import { EventBus } from "./features/events/event-bus.ts";
import { AnimeMutationService } from "./features/anime/service.ts";
import {
  DownloadControlService,
  DownloadStatusService,
  DownloadTriggerService,
  LibraryCommandService,
  RssCommandService,
} from "./features/operations/service-contract.ts";

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
  const animeService = yield* AnimeMutationService;
  const downloadStatusService = yield* DownloadStatusService;
  const downloadControlService = yield* DownloadControlService;
  const downloadTriggerService = yield* DownloadTriggerService;
  const libraryService = yield* LibraryCommandService;
  const rssService = yield* RssCommandService;

  const backgroundWorkerServices = {
    animeService,
    clock,
    downloadControlService,
    downloadStatusService,
    downloadTriggerService,
    eventBus,
    libraryService,
    monitor,
    rssService,
  } satisfies BackgroundWorkerDependencies;

  const controller = yield* makeBackgroundWorkerController({
    spawnWorkers: (scope, config) => spawnWorkersFromConfig(backgroundWorkerServices, scope, config),
  });

  yield* Effect.addFinalizer(() => controller.stop());

  return controller;
});

export const BackgroundWorkerControllerLive = Layer.scoped(
  BackgroundWorkerController,
  makeBackgroundWorkerControllerLive,
);
