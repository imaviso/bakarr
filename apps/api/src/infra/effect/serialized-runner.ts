import { Deferred, Effect, Exit, Option, Ref, Semaphore } from "effect";

/**
 * Serialized effect runners.
 *
 * Three coalescing behaviors over a shared effect, using Effect's coordination
 * primitives. All are scope-free: the wrapped effect runs in the triggering
 * fiber, so they compose into plain `Effect.Service` layers with `R = never`.
 *
 * - `SerializedShareEffectRunner`: concurrent `trigger` calls share one in-flight execution and all
 *   await the same result. The next call after completion starts a fresh execution. Implemented as a
 *   semaphore-guarded `Ref<{ completion, running }>` leader gate — the same pattern Effect's own
 *   `Cache` uses for pending lookups.
 * - `SerializedDropEffectRunner`: only one execution is allowed at a time. Overlapping `trigger`
 *   calls are dropped and return `Option.none()` instead of waiting. Implemented with
 *   `Semaphore.withPermitsIfAvailable(1)`.
 * - `SerializedDrainEffectRunner`: triggers while an execution is running record a single pending
 *   rerun. After the current run, the runner drains one more run, and repeats until no pending
 *   trigger remains. Concurrent triggers share the same completion. Implemented as a
 *   `Ref<{ completion, pending }>` state machine with an inline drain loop.
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

export const makeSerializedShareEffectRunner = Effect.fn(
  "EffectCoalescing.makeSerializedShareEffectRunner",
)(
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<SerializedShareEffectRunner<A, E, R>, never, R> =>
    Effect.gen(function* () {
      const semaphore = yield* Semaphore.make(1);
      const state = yield* Ref.make<{
        readonly completion: Deferred.Deferred<A, E> | null;
        readonly running: boolean;
      }>({ completion: null, running: false });

      const trigger = Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const start = yield* semaphore.withPermits(1)(
            Effect.gen(function* () {
              const current = yield* Ref.get(state);

              if (current.running && current.completion !== null) {
                const existing = { completion: current.completion, shouldStart: false };
                return existing;
              }

              const completion = yield* Deferred.make<A, E>();
              yield* Ref.set(state, { completion, running: true });

              const fresh = { completion, shouldStart: true };
              return fresh;
            }),
          );

          if (!start.shouldStart) {
            return yield* restore(Deferred.await(start.completion));
          }

          const exit = yield* Effect.exit(restore(effect));

          if (exit._tag === "Failure") {
            yield* semaphore.withPermits(1)(Ref.set(state, { completion: null, running: false }));
            yield* Deferred.failCause(start.completion, exit.cause);
            return yield* Effect.failCause(exit.cause);
          }

          yield* semaphore.withPermits(1)(Ref.set(state, { completion: null, running: false }));
          yield* Deferred.succeed(start.completion, exit.value);
          return exit.value;
        }),
      );

      return { trigger } satisfies SerializedShareEffectRunner<A, E, R>;
    }),
);

export const makeSerializedDropEffectRunner = Effect.fn(
  "EffectCoalescing.makeSerializedDropEffectRunner",
)(
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<SerializedDropEffectRunner<A, E, R>, never, R> =>
    Effect.gen(function* () {
      const semaphore = yield* Semaphore.make(1);

      const trigger = semaphore.withPermitsIfAvailable(1)(effect);

      return { trigger } satisfies SerializedDropEffectRunner<A, E, R>;
    }),
);

type DrainState<E> = {
  readonly completion: Deferred.Deferred<void, E> | null;
  readonly pending: boolean;
};

type DrainClaim<E> =
  | { readonly _tag: "lead"; readonly completion: Deferred.Deferred<void, E> }
  | { readonly _tag: "follow"; readonly completion: Deferred.Deferred<void, E> };

export const makeSerializedDrainEffectRunner = Effect.fn(
  "EffectCoalescing.makeSerializedDrainEffectRunner",
)(
  <E, R>(
    effect: Effect.Effect<void, E, R>,
  ): Effect.Effect<SerializedDrainEffectRunner<E, R>, never, R> =>
    Effect.gen(function* () {
      const state = yield* Ref.make<DrainState<E>>({ completion: null, pending: false });

      const settle = (completion: Deferred.Deferred<void, E>, exit: Exit.Exit<void, E>) =>
        Ref.set(state, { completion: null, pending: false }).pipe(
          exit._tag === "Success"
            ? Effect.andThen(Deferred.succeed(completion, void 0))
            : Effect.andThen(Deferred.failCause(completion, exit.cause)),
        );

      const runCycle = (): Effect.Effect<void, E, R> =>
        Effect.suspend(() =>
          Effect.gen(function* () {
            while (true) {
              yield* effect;

              const shouldDrain = yield* Ref.modify(state, (current): [boolean, DrainState<E>] =>
                current.pending
                  ? [true, { completion: current.completion, pending: false }]
                  : [false, { completion: null, pending: false }],
              );

              if (!shouldDrain) {
                return undefined;
              }
            }
          }),
        );

      // The lead cycle runs under a mask so the state reset and follower
      // settlement in `settle` cannot be skipped: an interrupt delivered inside
      // the restored effect still flows through `onExit`, waking followers and
      // leaving the runner usable. Without this, a dead completion Deferred
      // would hang every later trigger forever.
      const trigger: Effect.Effect<void, E, R> = Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const fresh = yield* Deferred.make<void, E>();
          const claim = yield* Ref.modify(state, (current): [DrainClaim<E>, DrainState<E>] => {
            if (current.completion === null) {
              return [
                { _tag: "lead", completion: fresh },
                { completion: fresh, pending: false },
              ];
            }

            return [
              { _tag: "follow", completion: current.completion },
              { ...current, pending: true },
            ];
          });

          if (claim._tag === "follow") {
            return yield* restore(Deferred.await(claim.completion));
          }

          return yield* Effect.onExit(restore(runCycle()), (exit) =>
            settle(claim.completion, exit),
          );
        }),
      );

      return { trigger } satisfies SerializedDrainEffectRunner<E, R>;
    }),
);
