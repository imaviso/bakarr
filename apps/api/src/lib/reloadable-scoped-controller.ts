import { Effect, Exit, Ref, Scope } from "effect";

export interface ReloadableScopedController<C, E> {
  readonly isStarted: () => Effect.Effect<boolean>;
  readonly reload: (config: C) => Effect.Effect<void, E>;
  readonly start: (config: C) => Effect.Effect<void, E>;
  readonly stop: () => Effect.Effect<void>;
}

export const makeReloadableScopedController = Effect.fn("ReloadableScopedController.make")(
  <C, E>(options: {
    readonly spawn: (scope: Scope.CloseableScope, config: C) => Effect.Effect<void, E>;
  }): Effect.Effect<ReloadableScopedController<C, E>> =>
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
      } satisfies ReloadableScopedController<C, E>;
    }),
);
