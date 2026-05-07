import { assert, it } from "@effect/vitest";
import { Cause, Data, Effect } from "effect";

import {
  JobFailurePersistenceError,
  markJobFailureOrFailWithError,
  markJobFailureOrFailWithCause,
} from "@/infra/job-failure-support.ts";

class TestJobError extends Data.TaggedError("TestJobError")<{
  readonly message: string;
}> {}

it.effect("markJobFailureOrFailWithError wraps failed mark with JobFailurePersistenceError", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      markJobFailureOrFailWithError({
        error: new Error("original"),
        job: "test-job",
        logMessage: "log message",
        markFailed: Effect.fail(new TestJobError({ message: "mark failed" })),
      }),
    );
    assert.deepStrictEqual(exit._tag, "Failure");
    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.ok(failure.value instanceof JobFailurePersistenceError);
        assert.deepStrictEqual(failure.value.job, "test-job");
      }
    }
  }),
);

it.effect("markJobFailureOrFailWithError succeeds when mark succeeds", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      markJobFailureOrFailWithError({
        error: new Error("original"),
        job: "test-job",
        logMessage: "log message",
        markFailed: Effect.void,
      }),
    );
    assert.deepStrictEqual(exit._tag, "Success");
  }),
);

it.effect("markJobFailureOrFailWithCause wraps failed mark with cause", () =>
  Effect.gen(function* () {
    const originalCause = Cause.fail(new TestJobError({ message: "original" }));
    const exit = yield* Effect.exit(
      markJobFailureOrFailWithCause({
        cause: originalCause,
        job: "test-job",
        logMessage: "log message",
        markFailed: Effect.fail(new TestJobError({ message: "mark failed" })),
      }),
    );
    assert.deepStrictEqual(exit._tag, "Failure");
    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.ok(failure.value instanceof JobFailurePersistenceError);
        assert.deepStrictEqual(failure.value.job, "test-job");
      }
    }
  }),
);

it.effect("markJobFailureOrFailWithCause succeeds when mark succeeds", () =>
  Effect.gen(function* () {
    const originalCause = Cause.fail(new TestJobError({ message: "original" }));
    const exit = yield* Effect.exit(
      markJobFailureOrFailWithCause({
        cause: originalCause,
        job: "test-job",
        logMessage: "log message",
        markFailed: Effect.void,
      }),
    );
    assert.deepStrictEqual(exit._tag, "Success");
  }),
);
