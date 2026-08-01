import { Deferred, Effect, Option, Ref } from "effect";

/**
 * Serialized effect runners.
 *
 * Three coalescing behaviors are offered, sharing the same coordination shape
 * (a permit-guarded state machine around the wrapped effect):
 * - `SerializedDrainEffectRunner`: if `trigger` is called while an execution is running, a single
 *   pending rerun is recorded. After the current run succeeds, the runner immediately drains one
 *   more run, and repeats until no pending trigger remains. Concurrent triggers share the same
 *   completion.
 * - `SerializedShareEffectRunner`: concurrent `trigger` calls share one in-flight execution and all
 *   await the same result. The next call after completion starts a fresh execution.
 * - `SerializedDropEffectRunner`: only one execution is allowed at a time. Overlapping `trigger`
 *   calls are dropped and return `Option.none()` instead of waiting for the current run.
 */

export interface SerializedDrainEffectRunner<E, R = never> {
  readonly trigger: Effect.Effect<void, E, R>;
}

export interface SerializedShareEffectRunner<A, E, R = never> {
  readonly trigger: Effect.Effect<A, E, R>;
}

export interface SerializedDropEffectRunner<A, E, R = never> {
  readonly trigger: Effect.Effect<Option.Option<A>, E, R>;
}

export const makeSerializedDrainEffectRunner = Effect.fn(
  "EffectCoalescing.makeSerializedDrainEffectRunner",
)(
  <E, R>(
    effect: Effect.Effect<void, E, R>,
  ): Effect.Effect<SerializedDrainEffectRunner<E, R>, never, R> =>
    makeDrainOrShareEffectRunner(true, effect),
);

export const makeSerializedShareEffectRunner = Effect.fn(
  "EffectCoalescing.makeSerializedShareEffectRunner",
)(
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<SerializedShareEffectRunner<A, E, R>, never, R> =>
    makeDrainOrShareEffectRunner(false, effect),
);

export const makeSerializedDropEffectRunner = Effect.fn(
  "EffectCoalescing.makeSerializedDropEffectRunner",
)(
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<SerializedDropEffectRunner<A, E, R>, never, R> =>
    Effect.gen(function* () {
      const semaphore = yield* Effect.makeSemaphore(1);
      const runningRef = yield* Ref.make(false);

      const trigger = Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const shouldRun = yield* semaphore.withPermits(1)(
            Effect.gen(function* () {
              const running = yield* Ref.get(runningRef);

              if (running) {
                return false;
              }

              yield* Ref.set(runningRef, true);
              return true;
            }),
          );

          if (!shouldRun) {
            return Option.none<A>();
          }

          const exit = yield* Effect.exit(restore(effect));
          yield* semaphore.withPermits(1)(Ref.set(runningRef, false));

          if (exit._tag === "Failure") {
            return yield* Effect.failCause(exit.cause);
          }

          return Option.some(exit.value);
        }),
      ).pipe(Effect.withSpan("SerializedEffectRunner.trigger"));

      return { trigger } satisfies SerializedDropEffectRunner<A, E, R>;
    }),
);

const makeDrainOrShareEffectRunner = Effect.fn("EffectCoalescing.makeSerializedEffectRunner")(
  <A, E, R>(
    drain: boolean,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<{ readonly trigger: Effect.Effect<A, E, R> }, never, R> =>
    Effect.gen(function* () {
      const semaphore = yield* Effect.makeSemaphore(1);
      const state = yield* Ref.make<{
        readonly completion: Deferred.Deferred<A, E> | null;
        readonly pending: boolean;
        readonly running: boolean;
      }>({ completion: null, pending: false, running: false });

      const runLoop = (completion: Deferred.Deferred<A, E>): Effect.Effect<void, never, R> =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            while (true) {
              const exit = yield* Effect.exit(restore(effect));

              if (exit._tag === "Failure") {
                yield* semaphore.withPermits(1)(
                  Ref.set(state, { completion: null, pending: false, running: false }),
                );
                yield* Deferred.failCause(completion, exit.cause);
                return;
              }

              const shouldContinue = yield* semaphore.withPermits(1)(
                Effect.gen(function* () {
                  const current = yield* Ref.get(state);

                  if (current.pending) {
                    yield* Ref.set(state, { completion, pending: false, running: true });
                    return true;
                  }

                  yield* Ref.set(state, { completion: null, pending: false, running: false });
                  return false;
                }),
              );

              if (!shouldContinue) {
                yield* Deferred.succeed(completion, exit.value);
                return;
              }
            }
          }),
        );

      const trigger = Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const start = yield* semaphore.withPermits(1)(
            Effect.gen(function* () {
              const current = yield* Ref.get(state);

              if (current.running && current.completion !== null) {
                if (drain) {
                  yield* Ref.set(state, { ...current, pending: true });
                }

                return { completion: current.completion, shouldStart: false } as const;
              }

              const completion = yield* Deferred.make<A, E>();

              yield* Ref.set(state, {
                completion,
                pending: false,
                running: true,
              });

              return { completion, shouldStart: true } as const;
            }),
          );

          if (start.shouldStart) {
            yield* runLoop(start.completion);
          }

          return yield* restore(Deferred.await(start.completion));
        }),
      ).pipe(Effect.withSpan("SerializedEffectRunner.trigger"));

      return { trigger };
    }),
);
