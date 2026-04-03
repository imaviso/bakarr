import { Deferred, Effect, Exit, Ref, Scope } from "effect";

export interface LatestValuePublisher<A, E, R = never> {
  readonly flush: Effect.Effect<void, E>;
  readonly offer: (value: A) => Effect.Effect<void, never, R>;
  readonly shutdown: Effect.Effect<void>;
}

export const makeLatestValuePublisher = Effect.fn("EffectCoalescing.makeLatestValuePublisher")(
  <A, E, R>(
    publish: (value: A) => Effect.Effect<void, E, R>,
  ): Effect.Effect<LatestValuePublisher<A, E, R>, never, Scope.Scope> =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const semaphore = yield* Effect.makeSemaphore(1);
      const state = yield* Ref.make<{
        readonly completion: Deferred.Deferred<void, E> | null;
        readonly latest: A | undefined;
        readonly running: boolean;
      }>({ completion: null, latest: undefined, running: false });

      const runLoop: Effect.Effect<void, never, R> = Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
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

            const exit = yield* Effect.exit(restore(publish(step.value)));

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
        }),
      );

      const offer = Effect.fn("LatestValuePublisher.offer")(
        (value: A): Effect.Effect<void, never, R> =>
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
              yield* Effect.forkIn(scope)(runLoop);
            }
          }),
      );

      const flush = Effect.gen(function* () {
        const completion = yield* semaphore
          .withPermits(1)(Ref.get(state))
          .pipe(Effect.map((current) => current.completion));

        if (completion !== null) {
          yield* Deferred.await(completion);
        }
      }).pipe(Effect.withSpan("LatestValuePublisher.flush"));

      const shutdown = Scope.close(scope, Exit.succeed(void 0)).pipe(
        Effect.withSpan("LatestValuePublisher.shutdown"),
      );

      return { flush, offer, shutdown } satisfies LatestValuePublisher<A, E, R>;
    }),
);
