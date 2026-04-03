import { Context, Effect, Exit, Ref, Scope } from "effect";
import { Layer } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { BackgroundTaskRunner } from "@/background-task-runner.ts";
import { makeBackgroundWorkerSpawner } from "@/background-workers.ts";
import { BackgroundWorkerMonitor } from "@/background-monitor.ts";

export interface BackgroundWorkerSpawner {
  (scope: Scope.Scope, config: Config): Effect.Effect<void, DatabaseError>;
}

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
  const scopeRef = yield* Ref.make<Scope.CloseableScope | null>(null);
  const lifecycleSemaphore = yield* Effect.makeSemaphore(1);

  const isStarted = Effect.fn("BackgroundWorkerController.isStarted")(function* () {
    const scope = yield* Ref.get(scopeRef);
    return scope !== null;
  });

  const stopCurrent = Effect.fn("BackgroundWorkerController.stopCurrent")(function* () {
    const current = yield* Ref.getAndSet(scopeRef, null);

    if (current !== null) {
      yield* Scope.close(current, Exit.succeed(void 0));
    }
  });

  const start = Effect.fn("BackgroundWorkerController.start")(function* (config: Config) {
    yield* lifecycleSemaphore.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* Ref.get(scopeRef);

        if (current !== null) {
          return;
        }

        const scope = yield* Scope.make();
        const exit = yield* Effect.exit(options.spawnWorkers(scope, config));

        if (exit._tag === "Failure") {
          yield* Scope.close(scope, Exit.void);
          return yield* Effect.failCause(exit.cause);
        }

        yield* Ref.set(scopeRef, scope);
      }),
    );
  });

  const reload = Effect.fn("BackgroundWorkerController.reload")(function* (config: Config) {
    yield* lifecycleSemaphore.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* Ref.get(scopeRef);

        const scope = yield* Scope.make();
        const exit = yield* Effect.exit(options.spawnWorkers(scope, config));

        if (exit._tag === "Failure") {
          yield* Scope.close(scope, Exit.void);
          return yield* Effect.failCause(exit.cause);
        }

        yield* Ref.set(scopeRef, scope);

        if (current !== null) {
          yield* Scope.close(current, Exit.succeed(void 0));
        }
      }),
    );
  });

  const stop = Effect.fn("BackgroundWorkerController.stop")(function* () {
    yield* lifecycleSemaphore.withPermits(1)(stopCurrent());
  });

  return {
    isStarted,
    reload,
    start,
    stop,
  } satisfies BackgroundWorkerControllerShape;
});

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const monitor = yield* BackgroundWorkerMonitor;
  const taskRunner = yield* BackgroundTaskRunner;
  const spawnWorkers = makeBackgroundWorkerSpawner({
    monitor,
    taskRunner,
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
