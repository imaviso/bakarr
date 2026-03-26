import { Effect, Exit, Ref, Scope } from "effect";

export interface ReloadableScopedController<C, E> {
  readonly isStarted: () => Effect.Effect<boolean>;
  readonly reload: (config: C) => Effect.Effect<void, E>;
  readonly start: (config: C) => Effect.Effect<void, E>;
  readonly stop: () => Effect.Effect<void>;
}

export function makeReloadableScopedController<C, E>(options: {
  readonly spawn: (config: C) => Effect.Effect<void, E, Scope.Scope>;
}): Effect.Effect<ReloadableScopedController<C, E>> {
  return Effect.gen(function* () {
    const scopeRef = yield* Ref.make<Scope.CloseableScope | null>(null);
    const lifecycleSemaphore = yield* Effect.makeSemaphore(1);

    const isStarted = () => Ref.get(scopeRef).pipe(Effect.map((scope) => scope !== null));

    const doStop = Effect.fn("ReloadableScopedController.stop")(function* () {
      const current = yield* Ref.getAndSet(scopeRef, null);
      if (current !== null) {
        yield* Scope.close(current, Exit.succeed(void 0));
      }
    });

    const doStart = Effect.fn("ReloadableScopedController.start")(function* (config: C) {
      const current = yield* Ref.get(scopeRef);
      if (current !== null) {
        return;
      }

      const scope = yield* Scope.make();
      const exit = yield* Effect.exit(
        options.spawn(config).pipe(Effect.provideService(Scope.Scope, scope)),
      );

      if (exit._tag === "Failure") {
        yield* Scope.close(scope, Exit.void);
        return yield* Effect.failCause(exit.cause);
      }

      yield* Ref.set(scopeRef, scope);
    });

    const doReload = Effect.fn("ReloadableScopedController.reload")(function* (config: C) {
      const current = yield* Ref.getAndSet(scopeRef, null);
      if (current !== null) {
        yield* Scope.close(current, Exit.succeed(void 0));
      }

      const scope = yield* Scope.make();
      const exit = yield* Effect.exit(
        options.spawn(config).pipe(Effect.provideService(Scope.Scope, scope)),
      );

      if (exit._tag === "Failure") {
        yield* Scope.close(scope, Exit.void);
        return yield* Effect.failCause(exit.cause);
      }

      yield* Ref.set(scopeRef, scope);
    });

    const stopCurrent = lifecycleSemaphore.withPermits(1)(doStop());
    const start = (config: C) => lifecycleSemaphore.withPermits(1)(doStart(config));
    const reload = (config: C) => lifecycleSemaphore.withPermits(1)(doReload(config));

    return {
      isStarted,
      reload,
      start,
      stop: () => stopCurrent,
    } satisfies ReloadableScopedController<C, E>;
  });
}
