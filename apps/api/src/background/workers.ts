// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)

import { Cause, Duration, Effect, Exit, Option, Schedule, Schema, Scope } from "effect";
import type { Config } from "@packages/shared/index.ts";
import type { BackgroundWorkerSpawner } from "@/background/controller-core.ts";
import { buildBackgroundSchedule, resolveBackgroundWorkerLoopPlan } from "@/background/schedule.ts";
import { BackgroundWorkerTimeouts } from "@/background/worker-timeouts.ts";
import type { BackgroundTaskRunnerShape } from "@/background/task-runner.ts";
import type { BackgroundWorkerMonitorShape } from "@/background/monitor.ts";
import { BACKGROUND_WORKER_NAMES, type BackgroundWorkerName } from "@/background/worker-model.ts";
import { makeSerializedDropEffectRunner } from "@/infra/effect/serialized-runner.ts";
import { compactLogAnnotations, errorCategory, errorLogAnnotations } from "@/infra/logging.ts";

export class WorkerTimeoutError extends Schema.TaggedError<WorkerTimeoutError>()(
  "WorkerTimeoutError",
  {
    workerName: Schema.String,
    timeoutMs: Schema.Number,
    message: Schema.String,
  },
) {}

export interface BackgroundWorkerPolicy {
  readonly resilientRun: <E, R>(
    workerName: BackgroundWorkerName,
    task: Effect.Effect<void, E, R>,
  ) => Effect.Effect<void, E, R>;
}

const BACKGROUND_WORKER_FAILURE_BACKOFF_BASE_MS = 5_000;
const BACKGROUND_WORKER_FAILURE_BACKOFF_MAX_MS = 60_000;

export function makeBackgroundWorkerPolicy(): BackgroundWorkerPolicy {
  const failureCounts = new Map<BackgroundWorkerName, number>();

  const resetFailureCount = Effect.fn("Background.resetFailureCount")(
    (workerName: BackgroundWorkerName) =>
      Effect.sync(() => {
        failureCounts.set(workerName, 0);
      }),
  );

  const nextFailureBackoffMs = Effect.fn("Background.nextFailureBackoffMs")(
    (workerName: BackgroundWorkerName) =>
      Effect.sync(() => {
        const failureCount = (failureCounts.get(workerName) ?? 0) + 1;
        failureCounts.set(workerName, failureCount);

        return Math.min(
          BACKGROUND_WORKER_FAILURE_BACKOFF_MAX_MS,
          failureCount * BACKGROUND_WORKER_FAILURE_BACKOFF_BASE_MS,
        );
      }),
  );

  const keepWorkerAlive = Effect.fn("Background.keepWorkerAlive")(function* <E>(
    workerName: BackgroundWorkerName,
    exit: Exit.Exit<void, E>,
  ) {
    if (exit._tag === "Success") {
      yield* resetFailureCount(workerName);
      return undefined;
    }

    if (Cause.hasInterruptsOnly(exit.cause)) {
      yield* resetFailureCount(workerName);
      return undefined;
    }

    const isDefect = Cause.hasDies(exit.cause);
    const backoffMs = yield* nextFailureBackoffMs(workerName);

    // Recovery scheduling is expected resilience, not a new failure: the run
    // attempt already logged its Error completion event. Keep this at Debug
    // with a distinct event so one failure produces one error line.
    yield* Effect.logDebug("background worker recovery scheduled").pipe(
      Effect.annotateLogs(
        compactLogAnnotations({
          backoffMs,
          component: "background",
          error_kind: errorCategory(exit.cause),
          event: "background.worker.recovery.scheduled",
          outcome: isDefect ? "defect" : "failed",
          workerName,
        }),
      ),
    );

    yield* Effect.sleep(`${backoffMs} millis`);
    return undefined;
  });

  const resilientRun = <E, R>(workerName: BackgroundWorkerName, task: Effect.Effect<void, E, R>) =>
    task.pipe(
      Effect.exit,
      Effect.flatMap((exit) => keepWorkerAlive(workerName, exit)),
    );

  return { resilientRun };
}

export function makeBackgroundWorkerSpawner(input: {
  readonly taskRunner: Pick<BackgroundTaskRunnerShape, "workerTask">;
  readonly monitor: BackgroundWorkerMonitorShape;
  readonly policy?: BackgroundWorkerPolicy;
}): BackgroundWorkerSpawner {
  const { monitor } = input;
  const policy = input.policy ?? makeBackgroundWorkerPolicy();

  return Effect.fn("Background.spawnWorkersFromConfig")(function* (
    workerScope: Scope.Scope,
    config: Config,
  ) {
    const schedule = buildBackgroundSchedule(config);

    for (const workerName of BACKGROUND_WORKER_NAMES) {
      const loopPlan = resolveBackgroundWorkerLoopPlan(schedule, workerName);

      if (loopPlan === null) {
        continue;
      }

      const loop = policy.resilientRun(workerName, input.taskRunner.workerTask(workerName));

      yield* forkSupervisedWorker(workerScope, workerName, repeatWorker(loop, loopPlan), monitor);
    }
  });
}

export const withLockEffectOrFail = Effect.fn("Background.withLockEffectOrFail")(function* <
  A,
  E,
  R,
>(
  workerName: BackgroundWorkerName,
  task: Effect.Effect<A, E, R>,
  monitor: BackgroundWorkerMonitorShape,
  timeoutMs?: number,
) {
  // Explicit timeouts (tests) skip the config-backed service entirely.
  const effectiveTimeout = timeoutMs ?? (yield* BackgroundWorkerTimeouts).get(workerName);
  // Caveat: the interrupt is delivered at Effect checkpoints only. Drizzle
  // transactions run under an uninterruptible mask and single statements are
  // `Effect.sync`, so a worker stuck inside a long SQLite transaction exceeds
  // its timeout cap arbitrarily — `WorkerTimeoutError` fires only after the
  // transaction settles. Keep transactions small in scan/sync paths.
  const taskWithTimeout = task.pipe(
    Effect.timeoutOrElse({
      duration: `${effectiveTimeout} millis`,
      orElse: () =>
        Effect.fail(
          new WorkerTimeoutError({
            workerName,
            timeoutMs: effectiveTimeout,
            message: `Worker timed out after ${effectiveTimeout}ms`,
          }),
        ),
    }),
  );

  const monitoredTask = Effect.gen(function* () {
    yield* monitor.markRunStarted(workerName);

    const [duration, exit] = yield* Effect.timed(Effect.exit(taskWithTimeout));
    const durationMs = Duration.toMillis(duration);

    if (exit._tag === "Success") {
      yield* monitor.markRunSucceeded(workerName, durationMs);
      yield* Effect.logDebug("background worker run completed").pipe(
        Effect.annotateLogs(
          compactLogAnnotations({
            component: "background",
            durationMs,
            event: "background.worker.run.completed",
            outcome: "success",
            workerName,
          }),
        ),
      );
      return undefined;
    }

    if (Cause.hasInterruptsOnly(exit.cause)) {
      yield* monitor.markRunInterrupted(workerName);
      return undefined;
    }

    const timeoutErrorOption = getWorkerTimeoutError(exit.cause);
    const errorMessage = Option.match(timeoutErrorOption, {
      onNone: () => Cause.pretty(exit.cause),
      onSome: (timeoutError) => timeoutError.message,
    });

    yield* monitor.markRunFailed(workerName, errorMessage, durationMs);
    yield* Effect.logError("background worker run completed").pipe(
      Effect.annotateLogs(
        compactLogAnnotations({
          component: "background",
          durationMs,
          error_kind: errorCategory(exit.cause),
          event: "background.worker.run.completed",
          outcome: Option.isSome(timeoutErrorOption) ? "timeout" : "failed",
          timeoutMs: Option.isSome(timeoutErrorOption)
            ? timeoutErrorOption.value.timeoutMs
            : undefined,
          workerName,
          // Typed failure fields only: the full cause tree can embed request
          // bodies or credentials, so it stays out of console annotations.
          ...errorLogAnnotations(Option.getOrUndefined(Cause.findErrorOption(exit.cause))),
        }),
      ),
    );

    return yield* Effect.failCause(exit.cause);
  });

  return yield* makeSerializedDropEffectRunner(monitoredTask).pipe(
    Effect.map((runner) =>
      runner.trigger.pipe(
        Effect.flatMap((result) =>
          Option.isNone(result) ? monitor.markRunSkipped(workerName) : Effect.void,
        ),
      ),
    ),
  );
});

function getWorkerTimeoutError(cause: Cause.Cause<unknown>) {
  const failure = Cause.findErrorOption(cause);

  if (Option.isSome(failure) && failure.value instanceof WorkerTimeoutError) {
    return Option.some(failure.value);
  }

  return Option.none<WorkerTimeoutError>();
}

export const forkSupervisedWorker = Effect.fn("Background.forkSupervisedWorker")(function* (
  scope: Scope.Scope,
  workerName: BackgroundWorkerName,
  task: Effect.Effect<void, unknown>,
  monitor: BackgroundWorkerMonitorShape,
) {
  yield* Effect.forkIn(scope)(
    Effect.gen(function* () {
      yield* monitor.markDaemonStarted(workerName);
      yield* task;
    }).pipe(
      Effect.ensuring(monitor.markDaemonStopped(workerName)),
      Effect.withSpan(`background.loop.${workerName}`),
    ),
  );
});

export function repeatWorker(
  task: Effect.Effect<void, unknown>,
  options:
    | {
        readonly cronExpression: string;
        readonly initialDelayMs?: number;
      }
    | {
        readonly intervalMs: number;
        readonly initialDelayMs?: number;
      },
) {
  const initialDelay = options.initialDelayMs ?? 0;
  const repeatedTask: Effect.Effect<void, unknown> =
    "cronExpression" in options
      ? task.pipe(Effect.repeat(Schedule.cron(options.cronExpression)), Effect.asVoid)
      : task.pipe(Effect.repeat(Schedule.spaced(`${options.intervalMs} millis`)), Effect.asVoid);

  return initialDelay > 0
    ? Effect.sleep(`${initialDelay} millis`).pipe(Effect.andThen(repeatedTask), Effect.asVoid)
    : repeatedTask;
}
