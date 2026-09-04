import { assert, describe, it } from "@effect/vitest";

import { Deferred, Effect, Fiber, Option } from "effect";

import { makeKeyedLocks } from "@/infra/effect/keyed-lock.ts";

describe("KeyedLocks", () => {
  it.effect("skipIfBusy drops overlapping triggers and returns None", () =>
    Effect.gen(function* () {
      const locks = makeKeyedLocks();
      const firstRunStarted = yield* Deferred.make<void>();
      const releaseFirstRun = yield* Deferred.make<void>();
      let runCount = 0;

      const effect = Effect.gen(function* () {
        runCount += 1;
        yield* Deferred.succeed(firstRunStarted, void 0);
        yield* Deferred.await(releaseFirstRun);
        return runCount;
      });

      const first = yield* Effect.forkChild(locks.skipIfBusy("worker", effect));
      yield* Deferred.await(firstRunStarted);

      const second = yield* locks.skipIfBusy("worker", effect);
      assert.deepStrictEqual(second._tag, "None");
      assert.deepStrictEqual(runCount, 1);

      yield* Deferred.succeed(releaseFirstRun, void 0);
      const firstResult = yield* Fiber.join(first);
      assert.deepStrictEqual(firstResult._tag, "Some");
      if (firstResult._tag === "Some") {
        assert.deepStrictEqual(firstResult.value, 1);
      }
    }),
  );

  it.effect("skipIfBusy allows a new run after the previous exits", () =>
    Effect.gen(function* () {
      const locks = makeKeyedLocks();
      let runCount = 0;

      const first = yield* locks.skipIfBusy(
        "worker",
        Effect.sync(() => {
          runCount += 1;
        }),
      );
      assert.deepStrictEqual(Option.isSome(first), true);

      const second = yield* locks.skipIfBusy(
        "worker",
        Effect.sync(() => {
          runCount += 1;
        }),
      );
      assert.deepStrictEqual(Option.isSome(second), true);
      assert.deepStrictEqual(runCount, 2);
    }),
  );

  it.effect("serialize waits for the in-flight run of the same key", () =>
    Effect.gen(function* () {
      const locks = makeKeyedLocks();
      const firstRunStarted = yield* Deferred.make<void>();
      const releaseFirstRun = yield* Deferred.make<void>();
      const order: Array<string> = [];

      const first = yield* Effect.forkChild(
        locks.serialize(
          "job",
          Effect.gen(function* () {
            order.push("first-start");
            yield* Deferred.succeed(firstRunStarted, void 0);
            yield* Deferred.await(releaseFirstRun);
            order.push("first-end");
          }),
        ),
      );
      yield* Deferred.await(firstRunStarted);

      const second = yield* Effect.forkChild(
        locks.serialize(
          "job",
          Effect.sync(() => {
            order.push("second-start");
          }),
        ),
      );

      yield* Effect.yieldNow;
      assert.deepStrictEqual(order, ["first-start"]);

      yield* Deferred.succeed(releaseFirstRun, void 0);
      yield* Fiber.join(first);
      yield* Fiber.join(second);

      assert.deepStrictEqual(order, ["first-start", "first-end", "second-start"]);
    }),
  );

  it.effect("serialize runs different keys concurrently", () =>
    Effect.gen(function* () {
      const locks = makeKeyedLocks();
      const firstEntered = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      const order: Array<string> = [];

      const first = yield* Effect.forkChild(
        locks.serialize(
          "a",
          Effect.andThen(Deferred.succeed(firstEntered, void 0), Deferred.await(releaseFirst)),
        ),
      );
      yield* Deferred.await(firstEntered);

      const second = yield* locks.serialize(
        "b",
        Effect.sync(() => {
          order.push("b-done");
        }),
      );
      assert.deepStrictEqual(second, undefined);
      assert.deepStrictEqual(order, ["b-done"]);

      yield* Deferred.succeed(releaseFirst, void 0);
      yield* Fiber.join(first);
    }),
  );

  it.effect("serialize releases the key when the run is interrupted", () =>
    Effect.gen(function* () {
      const locks = makeKeyedLocks();
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      const fiber = yield* Effect.forkChild(
        locks.serialize(
          "job",
          Effect.andThen(Deferred.succeed(entered, void 0), Deferred.await(release)),
        ),
      );
      yield* Deferred.await(entered);
      yield* Fiber.interrupt(fiber);

      const result = yield* locks.serialize("job", Effect.succeed("after-interrupt"));
      assert.deepStrictEqual(result, "after-interrupt");
    }),
  );
});
