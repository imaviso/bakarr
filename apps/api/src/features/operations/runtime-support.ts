import { Context, Effect, Exit, Layer, Scope } from "effect";

import { makeSerializedFlagCoordinator } from "../../lib/effect-coalescing.ts";

export interface OperationsSharedStateShape {
  readonly completeUnmappedScan: () => Effect.Effect<void>;
  readonly forkUnmappedScanLoop: (loop: Effect.Effect<void>) => Effect.Effect<void>;
  readonly runExclusiveDownloadTrigger: <A, E, R>(
    operation: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
  readonly tryBeginUnmappedScan: () => Effect.Effect<boolean>;
}

export class OperationsSharedState extends Context.Tag("@bakarr/api/OperationsSharedState")<
  OperationsSharedState,
  OperationsSharedStateShape
>() {}

export interface OperationsCoordinationShape {
  readonly completeUnmappedScan: () => Effect.Effect<void>;
  readonly forkUnmappedScanLoop: (loop: Effect.Effect<void>) => Effect.Effect<void>;
  readonly runExclusiveDownloadTrigger: <A, E, R>(
    operation: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
  readonly tryBeginUnmappedScan: () => Effect.Effect<boolean>;
}

export const makeOperationsSharedState = Effect.fn("OperationsService.makeSharedState")(
  function* () {
    const coordinator = yield* makeSerializedFlagCoordinator();
    const scope = yield* Scope.make();

    yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));

    return {
      completeUnmappedScan: () => coordinator.finish,
      forkUnmappedScanLoop: (loop: Effect.Effect<void>) =>
        Effect.forkIn(scope)(loop).pipe(Effect.asVoid),
      runExclusiveDownloadTrigger: <A, E, R>(operation: Effect.Effect<A, E, R>) =>
        coordinator.runSerialized(operation),
      tryBeginUnmappedScan: () => coordinator.tryStart,
    } satisfies OperationsCoordinationShape;
  },
);

export const OperationsSharedStateLive = Layer.scoped(
  OperationsSharedState,
  makeOperationsSharedState(),
);
