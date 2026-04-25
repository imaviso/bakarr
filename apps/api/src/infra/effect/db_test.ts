import { assert, it } from "@effect/vitest";
import { Effect, Either, Fiber, TestClock } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

it.effect("tryDatabasePromise retries SQLITE_BUSY failures until success", () =>
  Effect.gen(function* () {
    let attempts = 0;

    const fiber = yield* tryDatabasePromise("db failed", async () => {
      attempts += 1;

      if (attempts < 3) {
        throw new Error("database is locked");
      }

      return "ok";
    }).pipe(Effect.fork);

    yield* TestClock.adjust("100 millis");

    const result = yield* Fiber.join(fiber);

    assert.deepStrictEqual(result, "ok");
    assert.deepStrictEqual(attempts, 3);
  }),
);

it.effect("tryDatabasePromise stops immediately for non-busy failures", () =>
  Effect.gen(function* () {
    let attempts = 0;

    const result = yield* tryDatabasePromise("db failed", async () => {
      attempts += 1;
      throw new Error("constraint failed");
    }).pipe(Effect.either);

    assert.ok(Either.isLeft(result));
    assert.ok(result.left instanceof DatabaseError);
    assert.deepStrictEqual(result.left.message, "db failed");
    assert.deepStrictEqual(attempts, 1);
  }),
);
