import { Effect, Exit, Scope } from "effect";

import { makeSerializedFlagCoordinator } from "@/infra/effect/coalescing-serialized-flag-coordinator.ts";

export interface DownloadTriggerCoordinatorShape {
  readonly runExclusiveDownloadTrigger: <A, E>(
    operation: Effect.Effect<A, E>,
  ) => Effect.Effect<A, E>;
}

const makeDownloadTriggerCoordinator = Effect.fn(
  "OperationsService.makeDownloadTriggerCoordinator",
)(function* () {
  const semaphore = yield* Effect.makeSemaphore(1);
  const runExclusiveDownloadTrigger = Effect.fn(
    "DownloadTriggerCoordinator.runExclusiveDownloadTrigger",
  )(<A, E>(operation: Effect.Effect<A, E>) => semaphore.withPermits(1)(operation));

  return {
    runExclusiveDownloadTrigger,
  } satisfies DownloadTriggerCoordinatorShape;
});

export class DownloadTriggerCoordinator extends Effect.Service<DownloadTriggerCoordinator>()(
  "@bakarr/api/DownloadTriggerCoordinator",
  { effect: makeDownloadTriggerCoordinator() },
) {}

export const DownloadTriggerCoordinatorLive = DownloadTriggerCoordinator.Default;

export interface UnmappedScanCoordinatorShape {
  readonly completeUnmappedScan: () => Effect.Effect<void>;
  readonly forkUnmappedScanLoop: <A, E>(loop: Effect.Effect<A, E>) => Effect.Effect<void>;
  readonly tryBeginUnmappedScan: () => Effect.Effect<boolean>;
  readonly withUnmappedScanLease: <A, E>(input: {
    readonly whenAcquired: Effect.Effect<
      {
        readonly keepLease?: boolean;
        readonly value: A;
      },
      E
    >;
    readonly whenBusy: Effect.Effect<A, E>;
  }) => Effect.Effect<A, E>;
}

const makeUnmappedScanCoordinator = Effect.fn("OperationsService.makeUnmappedScanCoordinator")(
  function* () {
    const coordinator = yield* makeSerializedFlagCoordinator();
    const scope = yield* Scope.make();

    yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));

    const completeUnmappedScan = Effect.fn("UnmappedScanCoordinator.completeUnmappedScan")(
      () => coordinator.finish,
    );
    const forkUnmappedScanLoop = Effect.fn("UnmappedScanCoordinator.forkUnmappedScanLoop")(
      <A, E>(loop: Effect.Effect<A, E>) => Effect.forkIn(scope)(loop).pipe(Effect.asVoid),
    );
    const tryBeginUnmappedScan = Effect.fn("UnmappedScanCoordinator.tryBeginUnmappedScan")(
      () => coordinator.tryStartAndMarkRunning,
    );
    const withUnmappedScanLease = Effect.fn("UnmappedScanCoordinator.withUnmappedScanLease")(
      <A, E>(input: {
        readonly whenAcquired: Effect.Effect<
          {
            readonly keepLease?: boolean;
            readonly value: A;
          },
          E
        >;
        readonly whenBusy: Effect.Effect<A, E>;
      }) =>
        Effect.gen(function* () {
          const acquired = yield* coordinator.tryStartAndMarkRunning;

          if (!acquired) {
            return yield* input.whenBusy;
          }

          const exit = yield* Effect.exit(input.whenAcquired);

          if (Exit.isSuccess(exit)) {
            if (!exit.value.keepLease) {
              yield* coordinator.finish;
            }

            return exit.value.value;
          }

          yield* coordinator.finish;
          return yield* Effect.failCause(exit.cause);
        }),
    );

    return {
      completeUnmappedScan,
      forkUnmappedScanLoop,
      tryBeginUnmappedScan,
      withUnmappedScanLease,
    } satisfies UnmappedScanCoordinatorShape;
  },
);

export class UnmappedScanCoordinator extends Effect.Service<UnmappedScanCoordinator>()(
  "@bakarr/api/UnmappedScanCoordinator",
  { scoped: makeUnmappedScanCoordinator() },
) {}

export const UnmappedScanCoordinatorLive = UnmappedScanCoordinator.Default;
