import { Effect, Ref } from "effect";

/**
 * Minimal serialized execution flag.
 *
 * `tryStartAndMarkRunning` acquires the running flag atomically, and `finish` clears it.
 * This is the lightest coalescing primitive when only a boolean guard is needed.
 */

export interface SerializedFlagCoordinator {
  readonly finish: Effect.Effect<void>;
  readonly tryStartAndMarkRunning: Effect.Effect<boolean>;
}

export const makeSerializedFlagCoordinator = Effect.fn(
  "EffectCoalescing.makeSerializedFlagCoordinator",
)(
  (): Effect.Effect<SerializedFlagCoordinator> =>
    Effect.gen(function* () {
      const runningRef = yield* Ref.make(false);
      const finish = Ref.set(runningRef, false).pipe(
        Effect.withSpan("SerializedFlagCoordinator.finish"),
      );
      const tryStartAndMarkRunning = Ref.modify(runningRef, (running) =>
        running ? ([false, true] as const) : ([true, true] as const),
      ).pipe(Effect.withSpan("SerializedFlagCoordinator.tryStartAndMarkRunning"));

      return {
        finish,
        tryStartAndMarkRunning,
      } satisfies SerializedFlagCoordinator;
    }),
);
