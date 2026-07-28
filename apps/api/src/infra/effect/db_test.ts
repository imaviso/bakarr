import { assert, it } from "@effect/vitest";
import { Effect, Result, Fiber } from "effect";
import { TestClock } from "effect/testing";

import { DatabaseError } from "@/db/database.ts";
import { tryDatabase } from "@/infra/effect/db.ts";

it.effect("tryDatabase retries SQLITE_BUSY failures until success", () =>
  Effect.gen(function* () {
    let attempts = 0;

    const fiber = yield* tryDatabase("db failed", () =>
      Effect.suspend(() => {
        attempts += 1;

        return attempts < 3
          ? Effect.fail(new Error("database is locked"))
          : Effect.succeed("ok");
      }),
    ).pipe(Effect.forkChild);

    yield* TestClock.adjust("100 millis");

    const result = yield* Fiber.join(fiber);

    assert.deepStrictEqual(result, "ok");
    assert.deepStrictEqual(attempts, 3);
  }),
);

it.effect("tryDatabase stops immediately for non-busy failures", () =>
  Effect.gen(function* () {
    let attempts = 0;

    const result = yield* tryDatabase("db failed", () =>
      Effect.suspend(() => {
        attempts += 1;
        return Effect.fail(new Error("constraint failed"));
      }),
    ).pipe(Effect.result);

    assert.ok(Result.isFailure(result));
    assert.ok(result.failure instanceof DatabaseError);
    assert.deepStrictEqual(result.failure.message, "db failed");
    assert.deepStrictEqual(attempts, 1);
  }),
);
