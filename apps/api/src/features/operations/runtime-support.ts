import { Context, Effect, Exit, Layer, Scope } from "effect";

import { makeSerializedFlagCoordinator } from "@/lib/effect-coalescing-serialized-flag-coordinator.ts";

export interface DownloadTriggerCoordinatorShape {
  readonly runExclusiveDownloadTrigger: <A, E, R>(
    operation: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

export class DownloadTriggerCoordinator extends Context.Tag(
  "@bakarr/api/DownloadTriggerCoordinator",
)<DownloadTriggerCoordinator, DownloadTriggerCoordinatorShape>() {}

const makeDownloadTriggerCoordinator = Effect.fn(
  "OperationsService.makeDownloadTriggerCoordinator",
)(function* () {
  const semaphore = yield* Effect.makeSemaphore(1);

  return {
    runExclusiveDownloadTrigger: <A, E, R>(operation: Effect.Effect<A, E, R>) =>
      semaphore.withPermits(1)(operation),
  } satisfies DownloadTriggerCoordinatorShape;
});

export const DownloadTriggerCoordinatorLive = Layer.effect(
  DownloadTriggerCoordinator,
  makeDownloadTriggerCoordinator(),
);

export interface UnmappedScanCoordinatorShape {
  readonly completeUnmappedScan: () => Effect.Effect<void>;
  readonly forkUnmappedScanLoop: <A, E, R>(
    loop: Effect.Effect<A, E, R>,
  ) => Effect.Effect<void, never, R>;
  readonly tryBeginUnmappedScan: () => Effect.Effect<boolean>;
}

export class UnmappedScanCoordinator extends Context.Tag("@bakarr/api/UnmappedScanCoordinator")<
  UnmappedScanCoordinator,
  UnmappedScanCoordinatorShape
>() {}

const makeUnmappedScanCoordinator = Effect.fn("OperationsService.makeUnmappedScanCoordinator")(
  function* () {
    const coordinator = yield* makeSerializedFlagCoordinator();
    const scope = yield* Scope.make();

    yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));

    return {
      completeUnmappedScan: () => coordinator.finish,
      forkUnmappedScanLoop: <A, E, R>(loop: Effect.Effect<A, E, R>) =>
        Effect.forkIn(scope)(loop).pipe(Effect.asVoid),
      tryBeginUnmappedScan: () => coordinator.tryStart,
    } satisfies UnmappedScanCoordinatorShape;
  },
);

export const UnmappedScanCoordinatorLive = Layer.scoped(
  UnmappedScanCoordinator,
  makeUnmappedScanCoordinator(),
);
