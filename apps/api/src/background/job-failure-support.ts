// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Cause, Data, Effect, Record } from "effect";

import { causeLogAnnotations, errorCategory } from "@/infra/logging.ts";

export class JobFailurePersistenceError extends Data.TaggedError("JobFailurePersistenceError")<{
  readonly job: string;
  readonly mark_failure_cause: Cause.Cause<unknown>;
  readonly original_failure_cause: Cause.Cause<unknown>;
}> {}

// Typed failure fields for the persistence failure itself. The full cause
// tree stays out of console annotations; it can embed large or sensitive
// payloads from the failed journal write.
function markFailureAnnotations(markFailureCause: Cause.Cause<unknown>) {
  return causeLogAnnotations(markFailureCause);
}

export function markJobFailureOrFailWithError<M>(input: {
  readonly error: unknown;
  readonly job: string;
  readonly logMessage: string;
  readonly markFailed: Effect.Effect<void, M>;
  readonly logAnnotations?: Readonly<Record<string, unknown>>;
}) {
  return input.markFailed.pipe(
    Effect.catchCause((markFailureCause) =>
      Effect.logError(input.logMessage).pipe(
        Effect.annotateLogs({
          job: input.job,
          mark_job_failed_kind: errorCategory(markFailureCause),
          ...markFailureAnnotations(markFailureCause),
          ...input.logAnnotations,
        }),
        Effect.andThen(
          Effect.fail(
            new JobFailurePersistenceError({
              job: input.job,
              mark_failure_cause: markFailureCause,
              original_failure_cause: Cause.fail(input.error),
            }),
          ),
        ),
      ),
    ),
  );
}

export function markJobFailureOrFailWithCause<E, M>(input: {
  readonly cause: Cause.Cause<E>;
  readonly job: string;
  readonly logMessage: string;
  readonly markFailed: Effect.Effect<void, M>;
  readonly logAnnotations?: Readonly<Record<string, unknown>>;
}) {
  return input.markFailed.pipe(
    Effect.catchCause((markFailureCause) =>
      Effect.logError(input.logMessage).pipe(
        Effect.annotateLogs({
          job: input.job,
          mark_job_failed_kind: errorCategory(markFailureCause),
          ...markFailureAnnotations(markFailureCause),
          ...input.logAnnotations,
        }),
        Effect.andThen(
          Effect.fail(
            new JobFailurePersistenceError({
              job: input.job,
              mark_failure_cause: markFailureCause,
              original_failure_cause: input.cause,
            }),
          ),
        ),
      ),
    ),
  );
}
