import { Deferred, Effect, Exit, Ref, Scope } from "effect";

export interface CoalescedEffectRunner<E, R = never> {
  readonly trigger: Effect.Effect<void, E, R>;
}

export interface LatestValuePublisher<A, E, R = never> {
  readonly flush: Effect.Effect<void, E>;
  readonly offer: (value: A) => Effect.Effect<void, never, R>;
  readonly shutdown: Effect.Effect<void>;
}

export function makeCoalescedEffectRunner<E, R>(
  effect: Effect.Effect<void, E, R>,
): Effect.Effect<CoalescedEffectRunner<E, R>, never, R> {
  return Effect.gen(function* () {
    const semaphore = yield* Effect.makeSemaphore(1);
    const state = yield* Ref.make<{
      readonly completion: Deferred.Deferred<void, E> | null;
      readonly pending: boolean;
      readonly running: boolean;
    }>({
      completion: null,
      pending: false,
      running: false,
    });

    const runDrain = (
      completion: Deferred.Deferred<void, E>,
    ): Effect.Effect<void, never, R> =>
      Effect.gen(function* () {
        while (true) {
          const exit = yield* Effect.exit(effect);

          if (exit._tag === "Failure") {
            yield* semaphore.withPermits(1)(
              Ref.set(state, {
                completion: null,
                pending: false,
                running: false,
              }),
            );
            yield* Deferred.failCause(completion, exit.cause);
            return;
          }

          const shouldContinue = yield* semaphore.withPermits(1)(
            Effect.gen(function* () {
              const current = yield* Ref.get(state);

              if (current.pending) {
                yield* Ref.set(state, {
                  completion,
                  pending: false,
                  running: true,
                });
                return true;
              }

              yield* Ref.set(state, {
                completion: null,
                pending: false,
                running: false,
              });
              return false;
            }),
          );

          if (!shouldContinue) {
            yield* Deferred.succeed(completion, void 0);
            return;
          }
        }
      });

    const trigger = Effect.gen(function* () {
      const start = yield* semaphore.withPermits(1)(
        Effect.gen(function* () {
          const current = yield* Ref.get(state);

          if (current.running && current.completion !== null) {
            yield* Ref.set(state, {
              ...current,
              pending: true,
            });

            return {
              completion: current.completion,
              shouldStart: false,
            } as const;
          }

          const completion = yield* Deferred.make<void, E>();

          yield* Ref.set(state, {
            completion,
            pending: false,
            running: true,
          });

          return { completion, shouldStart: true } as const;
        }),
      );

      if (start.shouldStart) {
        yield* runDrain(start.completion);
      }

      yield* Deferred.await(start.completion);
    });

    return { trigger } satisfies CoalescedEffectRunner<E, R>;
  });
}

export function makeLatestValuePublisher<A, E, R>(
  publish: (value: A) => Effect.Effect<void, E, R>,
): Effect.Effect<LatestValuePublisher<A, E, R>> {
  return Effect.gen(function* () {
    const scope = yield* Scope.make();
    const semaphore = yield* Effect.makeSemaphore(1);
    const state = yield* Ref.make<{
      readonly completion: Deferred.Deferred<void, E> | null;
      readonly latest: A | undefined;
      readonly running: boolean;
    }>({
      completion: null,
      latest: undefined,
      running: false,
    });

    const runLoop: Effect.Effect<void, never, R> = Effect.gen(function* () {
      while (true) {
        const step = yield* semaphore.withPermits(1)(
          Effect.gen(function* () {
            const current = yield* Ref.get(state);

            if (current.completion === null) {
              return { type: "done" } as const;
            }

            if (current.latest === undefined) {
              yield* Ref.set(state, {
                completion: null,
                latest: undefined,
                running: false,
              });

              return {
                type: "complete",
                completion: current.completion,
              } as const;
            }

            yield* Ref.set(state, {
              completion: current.completion,
              latest: undefined,
              running: true,
            });

            return {
              type: "publish",
              completion: current.completion,
              value: current.latest,
            } as const;
          }),
        );

        if (step.type === "done") {
          return;
        }

        if (step.type === "complete") {
          yield* Deferred.succeed(step.completion, void 0);
          return;
        }

        const exit = yield* Effect.exit(publish(step.value));

        if (exit._tag === "Failure") {
          yield* semaphore.withPermits(1)(
            Ref.set(state, {
              completion: null,
              latest: undefined,
              running: false,
            }),
          );
          yield* Deferred.failCause(step.completion, exit.cause);
          return;
        }
      }
    });

    const offer = (value: A): Effect.Effect<void, never, R> =>
      Effect.gen(function* () {
        yield* semaphore.withPermits(1)(
          Effect.gen(function* () {
            const current = yield* Ref.get(state);

            if (current.completion !== null) {
              yield* Ref.set(state, {
                completion: current.completion,
                latest: value,
                running: current.running,
              });
              return;
            }

            const completion = yield* Deferred.make<void, E>();

            yield* Ref.set(state, {
              completion,
              latest: value,
              running: false,
            });
          }),
        );

        const shouldStart = yield* semaphore.withPermits(1)(
          Effect.gen(function* () {
            const current = yield* Ref.get(state);

            if (current.completion === null || current.running) {
              return false;
            }

            yield* Ref.set(state, {
              completion: current.completion,
              latest: current.latest,
              running: true,
            });

            return true;
          }),
        );

        if (shouldStart) {
          yield* Effect.forkIn(scope)(runLoop).pipe(Effect.asVoid);
        }
      });

    const flush = Effect.gen(function* () {
      const completion = yield* semaphore.withPermits(1)(Ref.get(state)).pipe(
        Effect.map((current) => current.completion),
      );

      if (completion !== null) {
        yield* Deferred.await(completion);
      }
    });

    const shutdown = Scope.close(scope, Exit.succeed(void 0));

    return { flush, offer, shutdown } satisfies LatestValuePublisher<A, E, R>;
  });
}
