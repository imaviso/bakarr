import { Context, Effect, Exit, Layer, Ref, Scope } from "effect";

import type { Config } from "../../../packages/shared/src/index.ts";
import type { DatabaseError } from "./db/database.ts";
import { ClockService } from "./lib/clock.ts";
import {
  spawnWorkersFromConfig,
  type BackgroundWorkerDependencies,
  type BackgroundWorkerSpawner,
} from "./background-workers.ts";
import { BackgroundWorkerMonitor } from "./background-monitor.ts";
import { EventBus } from "./features/events/event-bus.ts";
import { AnimeMutationService } from "./features/anime/service.ts";
import {
  CatalogOrchestration,
  SearchOrchestration,
} from "./features/operations/operations-orchestration.ts";

interface ReloadableScopedController<C, E, R = never> {
  readonly isStarted: () => Effect.Effect<boolean>;
  readonly reload: (config: C) => Effect.Effect<void, E, R>;
  readonly start: (config: C) => Effect.Effect<void, E, R>;
  readonly stop: () => Effect.Effect<void>;
}

const makeReloadableScopedController = Effect.fn("ReloadableScopedController.make")(
  <C, E, R>(options: {
    readonly spawn: (scope: Scope.CloseableScope, config: C) => Effect.Effect<void, E, R>;
  }): Effect.Effect<ReloadableScopedController<C, E, R>, never, R> =>
    Effect.gen(function* () {
      const scopeRef = yield* Ref.make<Scope.CloseableScope | null>(null);
      const lifecycleSemaphore = yield* Effect.makeSemaphore(1);

      const isStarted = Effect.fn("ReloadableScopedController.isStarted")(function* () {
        const scope = yield* Ref.get(scopeRef);
        return scope !== null;
      });

      const stopCurrent = Effect.fn("ReloadableScopedController.stopCurrent")(function* () {
        const current = yield* Ref.getAndSet(scopeRef, null);

        if (current !== null) {
          yield* Scope.close(current, Exit.succeed(void 0));
        }
      });

      const startCurrent = Effect.fn("ReloadableScopedController.startCurrent")(function* (
        config: C,
      ) {
        const current = yield* Ref.get(scopeRef);

        if (current !== null) {
          return;
        }

        const scope = yield* Scope.make();
        const exit = yield* Effect.exit(options.spawn(scope, config));

        if (exit._tag === "Failure") {
          yield* Scope.close(scope, Exit.void);
          return yield* Effect.failCause(exit.cause);
        }

        yield* Ref.set(scopeRef, scope);
      });

      const reloadCurrent = Effect.fn("ReloadableScopedController.reloadCurrent")(function* (
        config: C,
      ) {
        const current = yield* Ref.getAndSet(scopeRef, null);

        if (current !== null) {
          yield* Scope.close(current, Exit.succeed(void 0));
        }

        const scope = yield* Scope.make();
        const exit = yield* Effect.exit(options.spawn(scope, config));

        if (exit._tag === "Failure") {
          yield* Scope.close(scope, Exit.void);
          return yield* Effect.failCause(exit.cause);
        }

        yield* Ref.set(scopeRef, scope);
      });

      const stop = Effect.fn("ReloadableScopedController.stop")(function* () {
        yield* lifecycleSemaphore.withPermits(1)(stopCurrent());
      });
      const start = Effect.fn("ReloadableScopedController.start")(function* (config: C) {
        yield* lifecycleSemaphore.withPermits(1)(startCurrent(config));
      });
      const reload = Effect.fn("ReloadableScopedController.reload")(function* (config: C) {
        yield* lifecycleSemaphore.withPermits(1)(reloadCurrent(config));
      });

      return {
        isStarted,
        reload,
        start,
        stop,
      } satisfies ReloadableScopedController<C, E, R>;
    }),
);

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
