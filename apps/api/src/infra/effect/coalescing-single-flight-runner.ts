import { Deferred, Effect, Ref } from "effect";

/**
 * Single-flight runner.
 *
 * Concurrent `trigger` calls share one in-flight execution and all wait on the same deferred.
 * The next call after completion starts a fresh execution.
 */

export interface SingleFlightEffectRunner<A, E, R = never> {
  readonly trigger: Effect.Effect<A, E, R>;
}

export const makeSingleFlightEffectRunner = Effect.fn(
  "EffectCoalescing.makeSingleFlightEffectRunner",
)(
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<SingleFlightEffectRunner<A, E, R>, never, R> =>
    Effect.gen(function* () {
      const currentRunRef = yield* Ref.make<Deferred.Deferred<A, E> | null>(null);
      const stateSemaphore = yield* Effect.makeSemaphore(1);

      const clearCurrentRun = stateSemaphore.withPermits(1)(Ref.set(currentRunRef, null));

      const trigger = Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const current = yield* stateSemaphore.withPermits(1)(Ref.get(currentRunRef));

          if (current !== null) {
            return yield* restore(Deferred.await(current));
          }

          const deferred = yield* Deferred.make<A, E>();
          const started = yield* stateSemaphore.withPermits(1)(
            Effect.gen(function* () {
              const existing = yield* Ref.get(currentRunRef);

              if (existing !== null) {
                return existing;
              }

              yield* Ref.set(currentRunRef, deferred);
              return deferred;
            }),
          );

          if (started !== deferred) {
            return yield* restore(Deferred.await(started));
          }

          const exit = yield* Effect.exit(restore(effect));
          yield* clearCurrentRun;

          if (exit._tag === "Success") {
            yield* Deferred.succeed(deferred, exit.value);
          } else {
            yield* Deferred.failCause(deferred, exit.cause);
          }

          return yield* restore(Deferred.await(deferred));
        }),
      ).pipe(Effect.withSpan("SingleFlightEffectRunner.trigger"));

      return { trigger } satisfies SingleFlightEffectRunner<A, E, R>;
    }),
);
