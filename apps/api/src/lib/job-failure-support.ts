import { Cause, Data, Effect } from "effect";

export class JobFailurePersistenceError extends Data.TaggedError("JobFailurePersistenceError")<{
  readonly job: string;
  readonly mark_failure_cause: string;
  readonly original_failure: string;
}> {}

export function markJobFailureOrFailWithError<E>(input: {
  readonly error: E;
  readonly job: string;
  readonly logMessage: string;
  readonly markFailed: Effect.Effect<void, unknown>;
  readonly logAnnotations?: Readonly<Record<string, unknown>>;
}) {
  return input.markFailed.pipe(
    Effect.catchAllCause((markFailureCause) =>
      Effect.logError(input.logMessage).pipe(
        Effect.annotateLogs({
          job: input.job,
          mark_job_failed_cause: Cause.pretty(markFailureCause),
          ...input.logAnnotations,
        }),
        Effect.zipRight(
          Effect.fail(
            new JobFailurePersistenceError({
              job: input.job,
              mark_failure_cause: Cause.pretty(markFailureCause),
              original_failure: String(input.error),
            }),
          ),
        ),
      ),
    ),
  );
}

export function markJobFailureOrFailWithCause<E>(input: {
  readonly cause: Cause.Cause<E>;
  readonly job: string;
  readonly logMessage: string;
  readonly markFailed: Effect.Effect<void, unknown>;
  readonly logAnnotations?: Readonly<Record<string, unknown>>;
}) {
  return input.markFailed.pipe(
    Effect.catchAllCause((markFailureCause) =>
      Effect.logError(input.logMessage).pipe(
        Effect.annotateLogs({
          job: input.job,
          mark_job_failed_cause: Cause.pretty(markFailureCause),
          ...input.logAnnotations,
        }),
        Effect.zipRight(
          Effect.fail(
            new JobFailurePersistenceError({
              job: input.job,
              mark_failure_cause: Cause.pretty(markFailureCause),
              original_failure: Cause.pretty(input.cause),
            }),
          ),
        ),
      ),
    ),
  );
}
