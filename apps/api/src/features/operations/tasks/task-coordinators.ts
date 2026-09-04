import { Context, Effect, Exit, Layer, Ref, Scope, Semaphore } from "effect";

/**
 * Shared gate that serializes download trigger and background-search queue operations
 * across the services that write queued downloads.
 */
export class DownloadTriggerGate extends Context.Service<
  DownloadTriggerGate,
  Semaphore.Semaphore
>()("@bakarr/api/DownloadTriggerGate") {
  static readonly layer = Layer.effect(DownloadTriggerGate, Semaphore.make(1));
}

export const DownloadTriggerGateLive = DownloadTriggerGate.layer;

export interface UnmappedScanCoordinatorShape {
  readonly completeUnmappedScan: () => Effect.Effect<void>;
  readonly forkUnmappedScanLoop: <A, E>(loop: Effect.Effect<A, E>) => Effect.Effect<void>;
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

const makeUnmappedScanCoordinator = Effect.fn("RuntimeCoordinator.makeUnmappedScanCoordinator")(
  function* () {
    const runningRef = yield* Ref.make(false);
    const scope = yield* Scope.make();

    yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));

    const finish = Ref.set(runningRef, false).pipe(
      Effect.withSpan("UnmappedScanCoordinator.finish"),
    );
    const tryStartAndMarkRunning = Ref.modify(runningRef, (running): [boolean, boolean] =>
      running ? [false, true] : [true, true],
    ).pipe(Effect.withSpan("UnmappedScanCoordinator.tryStartAndMarkRunning"));

    const completeUnmappedScan = Effect.fn("UnmappedScanCoordinator.completeUnmappedScan")(
      () => finish,
    );
    const forkUnmappedScanLoop = Effect.fn("UnmappedScanCoordinator.forkUnmappedScanLoop")(
      <A, E>(loop: Effect.Effect<A, E>) => Effect.forkIn(scope)(loop).pipe(Effect.asVoid),
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
          const acquired = yield* tryStartAndMarkRunning;

          if (!acquired) {
            return yield* input.whenBusy;
          }

          const exit = yield* Effect.exit(input.whenAcquired);

          if (Exit.isSuccess(exit)) {
            if (!exit.value.keepLease) {
              yield* finish;
            }

            return exit.value.value;
          }

          yield* finish;
          return yield* Effect.failCause(exit.cause);
        }),
    );

    return {
      completeUnmappedScan,
      forkUnmappedScanLoop,
      withUnmappedScanLease,
    } satisfies UnmappedScanCoordinatorShape;
  },
);

export class UnmappedScanCoordinator extends Context.Service<
  UnmappedScanCoordinator,
  UnmappedScanCoordinatorShape
>()("@bakarr/api/UnmappedScanCoordinator") {
  static readonly layer = Layer.effect(UnmappedScanCoordinator, makeUnmappedScanCoordinator());
}

export const UnmappedScanCoordinatorLive = UnmappedScanCoordinator.layer;
