import { Effect, Ref } from "effect";

export interface SerializedFlagCoordinator {
  readonly finish: Effect.Effect<void>;
  readonly runSerialized: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  readonly tryStart: Effect.Effect<boolean>;
}

export const makeSerializedFlagCoordinator = Effect.fn(
  "EffectCoalescing.makeSerializedFlagCoordinator",
)(
  (): Effect.Effect<SerializedFlagCoordinator> =>
    Effect.gen(function* () {
      const semaphore = yield* Effect.makeSemaphore(1);
      const runningRef = yield* Ref.make(false);
      const finish = Ref.set(runningRef, false).pipe(
        Effect.withSpan("SerializedFlagCoordinator.finish"),
      );
      const runSerialized = Effect.fn("SerializedFlagCoordinator.runSerialized")(
        <A, E, R>(effect: Effect.Effect<A, E, R>) => semaphore.withPermits(1)(effect),
      );
      const tryStart = Ref.modify(runningRef, (running) => [running, true] as const).pipe(
        Effect.withSpan("SerializedFlagCoordinator.tryStart"),
      );

      return {
        finish,
        runSerialized,
        tryStart,
      } satisfies SerializedFlagCoordinator;
    }),
);
