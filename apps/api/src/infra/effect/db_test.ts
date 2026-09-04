// oxlint-disable oxc/no-async-await -- async/await required by transaction callbacks, test callbacks, and tryPromise wrappers

import * as TestClock from "effect/testing/TestClock";
import { Effect, Fiber, Result } from "effect";
import { assert, it } from "@effect/vitest";

import { DatabaseError } from "@/db/database.ts";
import { tryDatabaseQuery } from "@/infra/effect/db.ts";

it.effect("tryDatabaseQuery retries SQLITE_BUSY failures until success", () =>
  Effect.gen(function* () {
    let attempts = 0;

    const fiber = yield* tryDatabaseQuery(
      "db failed",
      Effect.tryPromise(async () => {
        attempts += 1;

        if (attempts < 3) {
          throw new Error("database is locked");
        }

        return "ok";
      }),
    ).pipe(Effect.forkChild);

    yield* TestClock.adjust("100 millis");

    const result = yield* Fiber.join(fiber);

    assert.deepStrictEqual(result, "ok");
    assert.deepStrictEqual(attempts, 3);
  }),
);

it.effect("tryDatabaseQuery stops immediately for non-busy failures", () =>
  Effect.gen(function* () {
    let attempts = 0;

    const result = yield* tryDatabaseQuery(
      "db failed",
      Effect.tryPromise(async () => {
        attempts += 1;
        throw new Error("constraint failed");
      }),
    ).pipe(Effect.result);

    assert.ok(Result.isFailure(result));
    assert.ok(result.failure instanceof DatabaseError);
    assert.deepStrictEqual(result.failure.message, "db failed");
    assert.deepStrictEqual(attempts, 1);
  }),
);
