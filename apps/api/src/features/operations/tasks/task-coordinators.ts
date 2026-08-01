import { Effect, Exit, Ref, Scope } from "effect";

/**
 * Shared gate that serializes download trigger and background-search queue operations
 * across the services that write queued downloads.
 */
export class DownloadTriggerGate extends Effect.Service<DownloadTriggerGate>()(
  "@bakarr/api/DownloadTriggerGate",
  { effect: Effect.makeSemaphore(1) },
) {}

export const DownloadTriggerGateLive = DownloadTriggerGate.Default;

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

const makeUnmappedScanCoordinator = Effect.fn("RuntimeCoordinator.makeUnmappedScanCoordinator")(
  function* () {
    const runningRef = yield* Ref.make(false);
    const scope = yield* Scope.make();

    yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));

    const finish = Ref.set(runningRef, false).pipe(
      Effect.withSpan("UnmappedScanCoordinator.finish"),
    );
    const tryStartAndMarkRunning = Ref.modify(runningRef, (running) =>
      running ? ([false, true] as const) : ([true, true] as const),
    ).pipe(Effect.withSpan("UnmappedScanCoordinator.tryStartAndMarkRunning"));

    const completeUnmappedScan = Effect.fn("UnmappedScanCoordinator.completeUnmappedScan")(
      () => finish,
    );
    const forkUnmappedScanLoop = Effect.fn("UnmappedScanCoordinator.forkUnmappedScanLoop")(
      <A, E>(loop: Effect.Effect<A, E>) => Effect.forkIn(scope)(loop).pipe(Effect.asVoid),
    );
    const tryBeginUnmappedScan = Effect.fn("UnmappedScanCoordinator.tryBeginUnmappedScan")(
      () => tryStartAndMarkRunning,
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
