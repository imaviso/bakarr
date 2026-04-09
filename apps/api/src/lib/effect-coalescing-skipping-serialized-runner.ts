import { Effect, Option, Ref } from "effect";

/**
 * Skipping serialized runner.
 *
 * Only one execution is allowed at a time. Overlapping `trigger` calls are dropped and return
 * `Option.none()` instead of waiting for the current run.
 */

export interface SkippingSerializedEffectRunner<A, E, R = never> {
  readonly trigger: Effect.Effect<Option.Option<A>, E, R>;
}

export const makeSkippingSerializedEffectRunner = Effect.fn(
  "EffectCoalescing.makeSkippingSerializedEffectRunner",
)(
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<SkippingSerializedEffectRunner<A, E, R>, never, R> =>
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
      ).pipe(Effect.withSpan("SkippingSerializedEffectRunner.trigger"));

      return { trigger } satisfies SkippingSerializedEffectRunner<A, E, R>;
    }),
);
