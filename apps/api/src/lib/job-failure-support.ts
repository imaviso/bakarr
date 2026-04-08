import { Cause, Effect } from "effect";

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
          Effect.failCause(Cause.sequential(Cause.fail(input.error), Cause.die(markFailureCause))),
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
          Effect.failCause(Cause.sequential(input.cause, Cause.die(markFailureCause))),
        ),
      ),
    ),
  );
}
