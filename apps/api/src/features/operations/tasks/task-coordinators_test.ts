import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  UnmappedScanCoordinator,
  UnmappedScanCoordinatorLive,
} from "@/features/operations/tasks/task-coordinators.ts";

describe("UnmappedScanCoordinator", () => {
  it.scoped("tryBeginUnmappedScan returns true first time", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      const started = yield* coordinator.tryBeginUnmappedScan();
      assert.deepStrictEqual(started, true);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.scoped("tryBeginUnmappedScan returns false while running", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* coordinator.tryBeginUnmappedScan();
      const started = yield* coordinator.tryBeginUnmappedScan();
      assert.deepStrictEqual(started, false);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.scoped("completeUnmappedScan allows re-start", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* coordinator.tryBeginUnmappedScan();
      yield* coordinator.completeUnmappedScan();
      const restarted = yield* coordinator.tryBeginUnmappedScan();
      assert.deepStrictEqual(restarted, true);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.scoped("completeUnmappedScan without start is no-op", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* coordinator.completeUnmappedScan();
      const started = yield* coordinator.tryBeginUnmappedScan();
      assert.deepStrictEqual(started, true);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.scoped("withUnmappedScanLease runs whenAcquired when free", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      const result = yield* coordinator.withUnmappedScanLease({
        whenAcquired: Effect.succeed({ value: 7 }),
        whenBusy: Effect.succeed(0),
      });
      assert.deepStrictEqual(result, 7);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.scoped("withUnmappedScanLease runs whenBusy while a scan holds the lease", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* coordinator.tryBeginUnmappedScan();
      const result = yield* coordinator.withUnmappedScanLease({
        whenAcquired: Effect.succeed({ value: 7 }),
        whenBusy: Effect.succeed(0),
      });
      assert.deepStrictEqual(result, 0);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.scoped("withUnmappedScanLease releases the lease unless keepLease", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* coordinator.withUnmappedScanLease({
        whenAcquired: Effect.succeed({ value: 1 }),
        whenBusy: Effect.succeed(0),
      });
      const started = yield* coordinator.tryBeginUnmappedScan();
      assert.deepStrictEqual(started, true);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.scoped("withUnmappedScanLease keeps the lease with keepLease", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      yield* coordinator.withUnmappedScanLease({
        whenAcquired: Effect.succeed({ keepLease: true, value: 1 }),
        whenBusy: Effect.succeed(0),
      });
      const started = yield* coordinator.tryBeginUnmappedScan();
      assert.deepStrictEqual(started, false);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );

  it.scoped("withUnmappedScanLease releases the lease on failure", () =>
    Effect.gen(function* () {
      const coordinator = yield* UnmappedScanCoordinator;
      const exit = yield* Effect.exit(
        coordinator.withUnmappedScanLease({
          whenAcquired: Effect.fail("boom"),
          whenBusy: Effect.succeed(0),
        }),
      );
      assert.deepStrictEqual(exit._tag, "Failure");
      const started = yield* coordinator.tryBeginUnmappedScan();
      assert.deepStrictEqual(started, true);
    }).pipe(Effect.provide(UnmappedScanCoordinatorLive)),
  );
});
