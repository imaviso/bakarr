// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Cause, Effect } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import type { BackgroundJobName } from "@/domain/worker-model.ts";
import { nowIso } from "@/infra/time.ts";
import {
  markJobFailureOrFailWithCause,
  markJobFailureOrFailWithError,
} from "@/infra/job-failure-support.ts";
import {
  BackgroundJobRepository,
  type BackgroundJobRepositoryShape,
} from "@/features/system/repository/background-job-repository.ts";

export interface BackgroundJobRunnerShape {
  readonly loadByName: (name: string) => ReturnType<BackgroundJobRepositoryShape["loadByName"]>;
  readonly runJob: <A, E, R>(
    name: BackgroundJobName,
    effect: Effect.Effect<A, E, R>,
    onSuccessMessage: (value: A) => string,
  ) => Effect.Effect<A, E | DatabaseError, R>;
  readonly markStarted: (name: BackgroundJobName) => Effect.Effect<void, DatabaseError>;
  readonly markSucceeded: (
    name: BackgroundJobName,
    message: string,
  ) => Effect.Effect<void, DatabaseError>;
  readonly markFailed: (name: BackgroundJobName, cause: unknown) => Effect.Effect<void>;
  readonly updateProgress: (
    name: BackgroundJobName,
    progressCurrent: number,
    progressTotal: number,
    message?: string,
  ) => Effect.Effect<void, DatabaseError>;
}

/**
 * Single owner of the background-job journal lifecycle.
 *
 * `markFailed` consolidates the failure-variant vocabulary (one log message +
 * `JobFailurePersistenceError` swallowing); `runJob` composes
 * started -> effect -> succeeded/failed (re-failing with the original cause).
 */
export function makeBackgroundJobRunnerShape(
  repository: BackgroundJobRepositoryShape,
): BackgroundJobRunnerShape {
  const loadByName = Effect.fn("BackgroundJobRunner.loadByName")(function* (name: string) {
    return yield* repository.loadByName(name);
  });

  const markStarted = Effect.fn("BackgroundJobRunner.markStarted")(function* (
    name: BackgroundJobName,
  ) {
    yield* repository.markStarted(name, nowIso);
  });
  const markSucceeded = Effect.fn("BackgroundJobRunner.markSucceeded")(function* (
    name: BackgroundJobName,
    message: string,
  ) {
    yield* repository.markSucceeded(name, message, nowIso);
  });

  const markFailed = Effect.fn("BackgroundJobRunner.markFailed")(function* (
    name: BackgroundJobName,
    cause: unknown,
  ) {
    const failureMark = Cause.isCause(cause)
      ? markJobFailureOrFailWithCause({
          cause,
          job: name,
          logMessage: `Failed to record ${name} job failure`,
          logAnnotations: { run_failure_cause: Cause.pretty(cause) },
          markFailed: repository.markFailed(name, cause, nowIso),
        })
      : markJobFailureOrFailWithError({
          error: cause,
          job: name,
          logMessage: `Failed to record ${name} job failure`,
          logAnnotations: { run_failure: describeFailure(cause) },
          markFailed: repository.markFailed(name, cause, nowIso),
        });

    yield* failureMark.pipe(Effect.catchTag("JobFailurePersistenceError", () => Effect.void));
  });

  const updateProgress = Effect.fn("BackgroundJobRunner.updateProgress")(function* (
    name: BackgroundJobName,
    progressCurrent: number,
    progressTotal: number,
    message?: string,
  ) {
    yield* repository.updateProgress(name, progressCurrent, progressTotal, nowIso, message);
  });

  const runJob = Effect.fn("BackgroundJobRunner.runJob")(function* <A, E, R>(
    name: BackgroundJobName,
    effect: Effect.Effect<A, E, R>,
    onSuccessMessage: (value: A) => string,
  ) {
    yield* markStarted(name);

    const exit = yield* Effect.exit(effect);

    if (exit._tag === "Success") {
      yield* markSucceeded(name, onSuccessMessage(exit.value));
      return exit.value;
    }

    if (!Cause.isInterruptedOnly(exit.cause)) {
      yield* markFailed(name, exit.cause);
    }

    return yield* Effect.failCause(exit.cause);
  });

  return {
    loadByName,
    markFailed,
    markStarted,
    markSucceeded,
    runJob,
    updateProgress,
  } satisfies BackgroundJobRunnerShape;
}

export class BackgroundJobRunner extends Effect.Service<BackgroundJobRunner>()(
  "@bakarr/api/BackgroundJobRunner",
  {
    effect: Effect.gen(function* () {
      const repository = yield* BackgroundJobRepository;
      return makeBackgroundJobRunnerShape(repository);
    }),
    dependencies: [BackgroundJobRepository.Default],
  },
) {}

export const BackgroundJobRunnerLive = BackgroundJobRunner.Default;

function describeFailure(cause: unknown): string {
  if (Cause.isCause(cause)) {
    return Cause.pretty(cause);
  }

  if (cause instanceof Error) {
    return cause.message;
  }

  return String(cause);
}
