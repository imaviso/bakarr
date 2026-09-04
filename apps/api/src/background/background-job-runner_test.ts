import { Cause, Effect, Exit, Option } from "effect";
import { eq } from "drizzle-orm";

import * as schema from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import type { DbExecutor } from "@/infra/effect/db.ts";
import { makeBackgroundJobRunnerShape } from "@/background/background-job-runner.ts";
import {
  makeBackgroundJobRepositoryShape,
  type BackgroundJobRepositoryShape,
} from "@/features/system/repository/background-job-repository.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { assert, describe, it } from "@effect/vitest";

describe("BackgroundJobRunner", () => {
  it.effect("runJob marks started, then succeeded with the success message", () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client, exec) =>
        Effect.gen(function* () {
          const runner = makeBackgroundJobRunnerShape(makeBackgroundJobRepositoryShape(db, client));

          const value = yield* runner.runJob(
            "rss",
            Effect.succeed({ newItems: 3 }),
            (result) => `Queued ${result.newItems} release(s)`,
          );

          assert.deepStrictEqual(value, { newItems: 3 });

          const job = yield* trySelectJob(db, exec);
          assert.deepStrictEqual(job?.lastStatus, "success");
          assert.deepStrictEqual(job?.lastMessage, "Queued 3 release(s)");
          assert.deepStrictEqual(job?.isRunning, false);
          assert.deepStrictEqual(job?.runCount, 1);
        }),
      schema,
    }),
  );

  it.effect("runJob marks failed and re-fails with the original cause on failure", () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client, exec) =>
        Effect.gen(function* () {
          const runner = makeBackgroundJobRunnerShape(makeBackgroundJobRepositoryShape(db, client));
          const boom = new Error("boom");

          const exit = yield* Effect.exit(
            runner.runJob("library_scan", Effect.fail(boom), () => "done"),
          );

          assert.deepStrictEqual(Exit.isFailure(exit), true);
          if (Exit.isFailure(exit)) {
            const failure = Cause.findErrorOption(exit.cause);
            assert.deepStrictEqual(failure._tag, "Some");
            if (failure._tag === "Some") {
              assert.deepStrictEqual(failure.value instanceof Error, true);
              assert.deepStrictEqual(failure.value.message, "boom");
            }
          }

          const job = yield* trySelectJob(db, exec, "library_scan");
          assert.deepStrictEqual(job?.lastStatus, "failed");
          assert.deepStrictEqual(job?.isRunning, false);
        }),
      schema,
    }),
  );

  it.effect("runJob does not mark failed for interrupted-only causes", () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client, exec) =>
        Effect.gen(function* () {
          const runner = makeBackgroundJobRunnerShape(makeBackgroundJobRepositoryShape(db, client));

          const exit = yield* Effect.exit(runner.runJob("rss", Effect.interrupt, () => "done"));

          assert.deepStrictEqual(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause), true);

          // markStarted already persisted the running row; no failure mark follows.
          const job = yield* trySelectJob(db, exec);
          assert.deepStrictEqual(job?.lastStatus, "running");
          assert.deepStrictEqual(job?.isRunning, true);
        }),
      schema,
    }),
  );

  it.effect("markStarted, markSucceeded, updateProgress, markFailed compose on the journal", () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client, exec) =>
        Effect.gen(function* () {
          const runner = makeBackgroundJobRunnerShape(makeBackgroundJobRepositoryShape(db, client));

          yield* runner.markStarted("unmapped_scan");
          yield* runner.updateProgress("unmapped_scan", 2, 5, "Matching folder");

          const inProgress = yield* trySelectJob(db, exec, "unmapped_scan");
          assert.deepStrictEqual(inProgress?.lastStatus, "running");
          assert.deepStrictEqual(inProgress?.isRunning, true);
          assert.deepStrictEqual(inProgress?.progressCurrent, 2);
          assert.deepStrictEqual(inProgress?.progressTotal, 5);
          assert.deepStrictEqual(inProgress?.lastMessage, "Matching folder");

          yield* runner.markSucceeded("unmapped_scan", "Processed 5 unmapped folder(s)");

          const job = yield* trySelectJob(db, exec, "unmapped_scan");
          assert.deepStrictEqual(job?.lastStatus, "success");
          assert.deepStrictEqual(job?.isRunning, false);
          assert.deepStrictEqual(job?.lastMessage, "Processed 5 unmapped folder(s)");

          yield* runner.markFailed("unmapped_scan", new Error("match failed"));

          const afterFailure = yield* trySelectJob(db, exec, "unmapped_scan");
          assert.deepStrictEqual(afterFailure?.lastStatus, "failed");
          assert.deepStrictEqual(afterFailure?.isRunning, false);
        }),
      schema,
    }),
  );

  it.effect("markFailed accepts a Cause and swallows JobFailurePersistenceError", () =>
    withSqliteTestDbEffect({
      run: (db, _databaseFile, client) =>
        Effect.gen(function* () {
          const failingRepository: BackgroundJobRepositoryShape = {
            ...makeBackgroundJobRepositoryShape(db, client),
            markFailed: () => Effect.die(new Error("journal write failed")),
          };
          const runner = makeBackgroundJobRunnerShape(failingRepository);

          // markFailed must not re-fail when the journal persistence itself fails.
          const exit = yield* Effect.exit(
            runner.markFailed("rss", Cause.fail(new Error("run failed"))),
          );
          assert.deepStrictEqual(Exit.isSuccess(exit), true);
        }),
      schema,
    }),
  );
});

function trySelectJob(db: AppDatabase, exec: DbExecutor, name = "rss") {
  return exec
    .queryFirst(
      "Failed to query background job",
      db
        .select()
        .from(schema.backgroundJobs)
        .where(eq(schema.backgroundJobs.name, name))
        .limit(1)
        .prepare()
        .effect(),
    )
    .pipe(Effect.map((row) => Option.getOrUndefined(row)));
}
