import { Deferred, Effect, Fiber } from "effect";
import { assert, describe, it } from "@effect/vitest";

import {
  makeSerializedDropEffectRunner,
  makeSerializedDrainEffectRunner,
  makeSerializedShareEffectRunner,
} from "@/infra/effect/serialized-runner.ts";

describe("serialized runner: drop", () => {
  it.effect("runs first call", () =>
    Effect.gen(function* () {
      let runs = 0;
      const runner = yield* makeSerializedDropEffectRunner(
        Effect.sync(() => {
          runs += 1;
          return 42;
        }),
      );
      const result = yield* runner.trigger;
      assert.deepStrictEqual(result._tag, "Some");
      if (result._tag === "Some") assert.deepStrictEqual(result.value, 42);
      assert.deepStrictEqual(runs, 1);
    }),
  );

  it.effect("skips overlapping calls", () =>
    Effect.gen(function* () {
      const firstRunStarted = yield* Deferred.make<void>();
      const releaseFirstRun = yield* Deferred.make<void>();
      let runs = 0;
      const runner = yield* makeSerializedDropEffectRunner(
        Effect.gen(function* () {
          runs += 1;
          yield* Deferred.succeed(firstRunStarted, void 0);
          yield* Deferred.await(releaseFirstRun);
          return 42;
        }),
      );
      const firstTrigger = yield* Effect.forkChild(runner.trigger);
      yield* Deferred.await(firstRunStarted);

      const secondResult = yield* runner.trigger;
      assert.deepStrictEqual(secondResult._tag, "None");
      assert.deepStrictEqual(runs, 1);

      yield* Deferred.succeed(releaseFirstRun, void 0);
      const firstResult = yield* Fiber.join(firstTrigger);
      assert.deepStrictEqual(firstResult._tag, "Some");
      if (firstResult._tag === "Some") assert.deepStrictEqual(firstResult.value, 42);
    }),
  );

  it.effect("propagates failure of the running effect", () =>
    Effect.gen(function* () {
      const runner = yield* makeSerializedDropEffectRunner(Effect.fail("boom"));
      const exit = yield* Effect.exit(runner.trigger);
      assert.deepStrictEqual(exit._tag, "Failure");
    }),
  );
});

describe("serialized runner: share", () => {
  it.effect("concurrent triggers share one in-flight execution and all get the value", () =>
    Effect.gen(function* () {
      const firstRunStarted = yield* Deferred.make<void>();
      const releaseFirstRun = yield* Deferred.make<void>();
      let runs = 0;
      const runner = yield* makeSerializedShareEffectRunner(
        Effect.gen(function* () {
          runs += 1;
          yield* Deferred.succeed(firstRunStarted, void 0);
          yield* Deferred.await(releaseFirstRun);
          return 42;
        }),
      );

      const firstTrigger = yield* Effect.forkChild(runner.trigger);
      yield* Deferred.await(firstRunStarted);

      const secondTrigger = yield* Effect.forkChild(runner.trigger);
      const thirdTrigger = yield* Effect.forkChild(runner.trigger);
      // Let the follower fibers reach their Ref gate before releasing the run.
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assert.deepStrictEqual(runs, 1);

      yield* Deferred.succeed(releaseFirstRun, void 0);

      const results = yield* Effect.all(
        [firstTrigger, secondTrigger, thirdTrigger].map((fiber) => Fiber.join(fiber)),
        { concurrency: "unbounded" },
      );
      assert.deepStrictEqual(results, [42, 42, 42]);
      assert.deepStrictEqual(runs, 1);
    }),
  );

  it.effect("next call after completion starts a fresh execution", () =>
    Effect.gen(function* () {
      let runs = 0;
      const runner = yield* makeSerializedShareEffectRunner(
        Effect.sync(() => {
          runs += 1;
          return runs;
        }),
      );

      assert.deepStrictEqual(yield* runner.trigger, 1);
      assert.deepStrictEqual(yield* runner.trigger, 2);
      assert.deepStrictEqual(runs, 2);
    }),
  );

  it.effect("all concurrent triggers fail when the shared run fails", () =>
    Effect.gen(function* () {
      const firstRunStarted = yield* Deferred.make<void>();
      const releaseFirstRun = yield* Deferred.make<void>();
      const runner = yield* makeSerializedShareEffectRunner(
        Effect.gen(function* () {
          yield* Deferred.succeed(firstRunStarted, void 0);
          yield* Deferred.await(releaseFirstRun);
          return yield* Effect.fail("boom");
        }),
      );

      const firstTrigger = yield* Effect.forkChild(runner.trigger);
      yield* Deferred.await(firstRunStarted);
      const secondTrigger = yield* Effect.forkChild(runner.trigger);

      yield* Deferred.succeed(releaseFirstRun, void 0);

      const firstExit = yield* Fiber.await(firstTrigger);
      const secondExit = yield* Fiber.await(secondTrigger);
      assert.deepStrictEqual(firstExit._tag, "Failure");
      assert.deepStrictEqual(secondExit._tag, "Failure");
    }),
  );

  it.effect("a fresh call after a failure starts a new execution", () =>
    Effect.gen(function* () {
      let runs = 0;
      const runner = yield* makeSerializedShareEffectRunner(
        Effect.gen(function* () {
          runs += 1;
          if (runs === 1) {
            return yield* Effect.fail("boom");
          }
          return "ok";
        }),
      );

      assert.deepStrictEqual((yield* Effect.exit(runner.trigger))._tag, "Failure");
      assert.deepStrictEqual(yield* runner.trigger, "ok");
      assert.deepStrictEqual(runs, 2);
    }),
  );
});

describe("serialized runner: drain", () => {
  it.effect("batches concurrent triggers into one follow-up run", () =>
    Effect.gen(function* () {
      const firstRunStarted = yield* Deferred.make<void>();
      const secondRunStarted = yield* Deferred.make<void>();
      const releaseFirstRun = yield* Deferred.make<void>();
      const releaseSecondRun = yield* Deferred.make<void>();
      const runCount = yield* Effect.sync(() => ({ value: 0 }));

      const runner = yield* makeSerializedDrainEffectRunner(
        Effect.gen(function* () {
          runCount.value += 1;

          if (runCount.value === 1) {
            yield* Deferred.succeed(firstRunStarted, void 0);
            yield* Deferred.await(releaseFirstRun);
            return;
          }

          yield* Deferred.succeed(secondRunStarted, void 0);
          yield* Deferred.await(releaseSecondRun);
        }),
      );

      const firstTrigger = yield* Effect.forkChild(runner.trigger);
      yield* Deferred.await(firstRunStarted);

      const secondTrigger = yield* Effect.forkChild(runner.trigger);
      const thirdTrigger = yield* Effect.forkChild(runner.trigger);
      // Let the follower fibers reach their Ref gate before releasing the run.
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;

      assert.deepStrictEqual(runCount.value, 1);

      yield* Deferred.succeed(releaseFirstRun, void 0);
      yield* Deferred.await(secondRunStarted);

      assert.deepStrictEqual(runCount.value, 2);

      yield* Deferred.succeed(releaseSecondRun, void 0);
      yield* Fiber.await(firstTrigger);
      yield* Fiber.await(secondTrigger);
      yield* Fiber.await(thirdTrigger);

      assert.deepStrictEqual(runCount.value, 2);
    }),
  );

  it.effect("runs exactly once when triggers do not overlap", () =>
    Effect.gen(function* () {
      let runs = 0;
      const runner = yield* makeSerializedDrainEffectRunner(
        Effect.sync(() => {
          runs += 1;
        }),
      );

      yield* runner.trigger;
      yield* runner.trigger;
      assert.deepStrictEqual(runs, 2);
    }),
  );

  it.effect("fails all waiting triggers when a run fails and allows a fresh start", () =>
    Effect.gen(function* () {
      const firstRunStarted = yield* Deferred.make<void>();
      const releaseFirstRun = yield* Deferred.make<void>();
      let runs = 0;
      const runner = yield* makeSerializedDrainEffectRunner(
        Effect.gen(function* () {
          runs += 1;
          if (runs === 1) {
            yield* Deferred.succeed(firstRunStarted, void 0);
            yield* Deferred.await(releaseFirstRun);
            return yield* Effect.fail("boom");
          }
          return undefined;
        }),
      );

      const firstTrigger = yield* Effect.forkChild(runner.trigger);
      yield* Deferred.await(firstRunStarted);
      const secondTrigger = yield* Effect.forkChild(runner.trigger);
      // Let the follower reach its Ref gate before releasing the run.
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;

      yield* Deferred.succeed(releaseFirstRun, void 0);

      const firstExit = yield* Fiber.await(firstTrigger);
      const secondExit = yield* Fiber.await(secondTrigger);
      assert.deepStrictEqual(firstExit._tag, "Failure");
      assert.deepStrictEqual(secondExit._tag, "Failure");

      yield* runner.trigger;
      assert.deepStrictEqual(runs, 2);
    }),
  );

  it.effect("interrupting the lead run fails followers and keeps the runner usable", () =>
    Effect.gen(function* () {
      const firstRunStarted = yield* Deferred.make<void>();
      let runs = 0;
      const runner = yield* makeSerializedDrainEffectRunner(
        Effect.gen(function* () {
          runs += 1;
          if (runs === 1) {
            yield* Deferred.succeed(firstRunStarted, void 0);
            return yield* Effect.never;
          }
          return undefined;
        }),
      );

      const lead = yield* Effect.forkChild(runner.trigger);
      yield* Deferred.await(firstRunStarted);
      const follower = yield* Effect.forkChild(runner.trigger);
      // Let the follower reach its Ref gate before interrupting the lead.
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;

      yield* Fiber.interrupt(lead);

      const followerExit = yield* Fiber.await(follower);
      assert.deepStrictEqual(followerExit._tag, "Failure");

      yield* runner.trigger;
      assert.deepStrictEqual(runs, 2);
    }),
  );
});
