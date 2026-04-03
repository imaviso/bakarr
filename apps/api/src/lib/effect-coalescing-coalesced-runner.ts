import { Deferred, Effect, Ref, Scope } from "effect";

export interface CoalescedEffectRunner<E, R = never> {
  readonly trigger: Effect.Effect<void, E, R>;
}

export const makeCoalescedEffectRunner = Effect.fn("EffectCoalescing.makeCoalescedEffectRunner")(
  <E, R>(
    effect: Effect.Effect<void, E, R>,
  ): Effect.Effect<CoalescedEffectRunner<E, R>, never, R | Scope.Scope> =>
    Effect.gen(function* () {
      const semaphore = yield* Effect.makeSemaphore(1);
      const state = yield* Ref.make<{
        readonly completion: Deferred.Deferred<void, E> | null;
        readonly pending: boolean;
        readonly running: boolean;
      }>({ completion: null, pending: false, running: false });

      const runDrain = (completion: Deferred.Deferred<void, E>): Effect.Effect<void, never, R> =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            while (true) {
              const exit = yield* Effect.exit(restore(effect));

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
          }),
        );

      const trigger = Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
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

          yield* restore(Deferred.await(start.completion));
        }),
      ).pipe(Effect.withSpan("CoalescedEffectRunner.trigger"));

      return { trigger } satisfies CoalescedEffectRunner<E, R>;
    }),
);
