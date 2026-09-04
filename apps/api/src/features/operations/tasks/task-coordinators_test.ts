import { assert, describe, it } from "@effect/vitest";

import { Effect } from "effect";
import {
  UnmappedScanCoordinator,
  UnmappedScanCoordinatorLive,
} from "@/features/operations/tasks/task-coordinators.ts";

const tryBegin = (coordinator: typeof UnmappedScanCoordinator.Service) =>
  coordinator.withUnmappedScanLease({
    whenAcquired: Effect.succeed({ keepLease: true, value: true }),
    whenBusy: Effect.succeed(false),
  });

describe("UnmappedScanCoordinator", () => {
  it.effect("acquires the lease when free", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      const started = yield* tryBegin(coordinator);
      assert.deepStrictEqual(started, true);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.effect("returns busy while the lease is held", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* tryBegin(coordinator);
      const started = yield* tryBegin(coordinator);
      assert.deepStrictEqual(started, false);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.effect("completeUnmappedScan allows re-start", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* tryBegin(coordinator);
      yield* coordinator.completeUnmappedScan();
      const restarted = yield* tryBegin(coordinator);
      assert.deepStrictEqual(restarted, true);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.effect("completeUnmappedScan without start is no-op", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* coordinator.completeUnmappedScan();
      const started = yield* tryBegin(coordinator);
      assert.deepStrictEqual(started, true);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.effect("withUnmappedScanLease runs whenAcquired when free", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      const result = yield* coordinator.withUnmappedScanLease({
        whenAcquired: Effect.succeed({ value: 7 }),
        whenBusy: Effect.succeed(0),
      });
      assert.deepStrictEqual(result, 7);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.effect("withUnmappedScanLease runs whenBusy while a scan holds the lease", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* tryBegin(coordinator);
      const result = yield* coordinator.withUnmappedScanLease({
        whenAcquired: Effect.succeed({ value: 7 }),
        whenBusy: Effect.succeed(0),
      });
      assert.deepStrictEqual(result, 0);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.effect("withUnmappedScanLease releases the lease unless keepLease", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* coordinator.withUnmappedScanLease({
        whenAcquired: Effect.succeed({ value: 1 }),
        whenBusy: Effect.succeed(0),
      });
      const started = yield* tryBegin(coordinator);
      assert.deepStrictEqual(started, true);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.effect("withUnmappedScanLease keeps the lease with keepLease", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* coordinator.withUnmappedScanLease({
        whenAcquired: Effect.succeed({ keepLease: true, value: 1 }),
        whenBusy: Effect.succeed(0),
      });
      const started = yield* tryBegin(coordinator);
      assert.deepStrictEqual(started, false);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.effect("withUnmappedScanLease releases the lease on failure", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      const exit = yield* Effect.exit(
        coordinator.withUnmappedScanLease({
          whenAcquired: Effect.fail("boom"),
          whenBusy: Effect.succeed(0),
        }),
      );
      assert.deepStrictEqual(exit._tag, "Failure");
      const started = yield* tryBegin(coordinator);
      assert.deepStrictEqual(started, true);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );
});
