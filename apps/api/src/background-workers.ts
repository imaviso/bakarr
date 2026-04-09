import { Cause, Effect, Option, Schedule, Schema } from "effect";
import { Exit } from "effect";
import type { Scope } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { BackgroundWorkerSpawner } from "@/background-controller-core.ts";
import { buildBackgroundSchedule, resolveBackgroundWorkerLoopPlan } from "@/background-schedule.ts";
import type {
  BackgroundTaskRunnerError,
  BackgroundTaskRunnerShape,
} from "@/background-task-runner.ts";
import type { BackgroundWorkerMonitorShape } from "@/background-monitor.ts";
import {
  BACKGROUND_WORKER_NAMES,
  BACKGROUND_WORKER_TIMEOUT_MS,
  type BackgroundWorkerName,
} from "@/background-worker-model.ts";
import type { ClockServiceShape } from "@/lib/clock.ts";
import { makeSkippingSerializedEffectRunner } from "@/lib/effect-coalescing-skipping-serialized-runner.ts";
import { compactLogAnnotations, durationMsSince, errorLogAnnotations } from "@/lib/logging.ts";

export class WorkerTimeoutError extends Schema.TaggedError<WorkerTimeoutError>()(
  "WorkerTimeoutError",
  {
    workerName: Schema.String,
    timeoutMs: Schema.Number,
    message: Schema.String,
  },
) {}

export function makeBackgroundWorkerSpawner(input: {
  readonly taskRunner: BackgroundTaskRunnerShape;
  readonly monitor: BackgroundWorkerMonitorShape;
}): BackgroundWorkerSpawner {
  const { taskRunner, monitor } = input;

  const keepWorkerAlive = Effect.fn("Background.keepWorkerAlive")(function* <E>(
    workerName: BackgroundWorkerName,
    exit: Exit.Exit<void, E>,
  ) {
    if (exit._tag === "Success") {
      return;
    }

    if (Cause.isInterruptedOnly(exit.cause)) {
      return yield* Effect.interrupt;
    }

    if (Cause.isDie(exit.cause)) {
      return yield* Effect.failCause(exit.cause);
    }

    yield* Effect.logWarning("background worker run failed; keeping daemon alive").pipe(
      Effect.annotateLogs(
        compactLogAnnotations({
          component: "background",
          event: "background.worker.run.failed",
          workerName,
          error: Cause.pretty(exit.cause),
        }),
      ),
    );
  });

  const resilientRun = <E, R>(workerName: BackgroundWorkerName, task: Effect.Effect<void, E, R>) =>
    task.pipe(
      Effect.exit,
      Effect.flatMap((exit) => keepWorkerAlive(workerName, exit)),
    );

  return Effect.fn("Background.spawnWorkersFromConfig")(function* (
    workerScope: Scope.Scope,
    config: Config,
  ) {
    const schedule = buildBackgroundSchedule(config);
    const workerTaskByName: Record<
      BackgroundWorkerName,
      () => Effect.Effect<void, BackgroundTaskRunnerError>
    > = {
      download_sync: taskRunner.runDownloadSyncWorkerTask,
      library_scan: taskRunner.runLibraryScanWorkerTask,
      metadata_refresh: taskRunner.runMetadataRefreshWorkerTask,
      rss: taskRunner.runRssWorkerTask,
    };

    for (const workerName of BACKGROUND_WORKER_NAMES) {
      const loopPlan = resolveBackgroundWorkerLoopPlan(schedule, workerName);

      if (loopPlan === null) {
        continue;
      }

      const loop = resilientRun(workerName, workerTaskByName[workerName]());

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
  clock: ClockServiceShape,
  timeoutMs?: number,
) {
  const effectiveTimeout = timeoutMs ?? BACKGROUND_WORKER_TIMEOUT_MS[workerName];
  const taskWithTimeout = task.pipe(
    Effect.timeoutFail({
      duration: `${effectiveTimeout} millis`,
      onTimeout: () =>
        new WorkerTimeoutError({
          workerName,
          timeoutMs: effectiveTimeout,
          message: `Worker timed out after ${effectiveTimeout}ms`,
        }),
    }),
  );

  const monitoredTask = Effect.gen(function* () {
    const startedAt = yield* clock.currentMonotonicMillis;
    yield* monitor.markRunStarted(workerName);

    const exit = yield* Effect.exit(taskWithTimeout);
    const finishedAt = yield* clock.currentMonotonicMillis;
    const durationMs = durationMsSince(startedAt, finishedAt);

    if (exit._tag === "Success") {
      yield* monitor.markRunSucceeded(workerName, durationMs);
      return;
    }

    if (Cause.isInterruptedOnly(exit.cause)) {
      yield* monitor.markRunInterrupted(workerName);
      return;
    }

    const timeoutErrorOption = getWorkerTimeoutError(exit.cause);
    const errorMessage = Option.match(timeoutErrorOption, {
      onNone: () => Cause.pretty(exit.cause),
      onSome: (timeoutError) => timeoutError.message,
    });

    yield* monitor.markRunFailed(workerName, errorMessage, durationMs);
    yield* Effect.logError(
      Option.isSome(timeoutErrorOption)
        ? "background worker timed out"
        : "background worker failed",
    ).pipe(
      Effect.annotateLogs(
        compactLogAnnotations({
          cause: Cause.pretty(exit.cause),
          component: "background",
          durationMs,
          event: Option.isSome(timeoutErrorOption)
            ? "background.worker.timeout"
            : "background.worker.failed",
          timeoutMs: Option.isSome(timeoutErrorOption)
            ? timeoutErrorOption.value.timeoutMs
            : undefined,
          workerName,
          ...errorLogAnnotations(errorMessage),
        }),
      ),
    );

    return yield* Effect.failCause(exit.cause);
  });

  return yield* makeSkippingSerializedEffectRunner(monitoredTask).pipe(
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
  const failure = Cause.failureOption(cause);

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
  yield* monitor.markDaemonStarted(workerName);

  yield* Effect.forkIn(scope)(
    task.pipe(
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
    ? Effect.sleep(`${initialDelay} millis`).pipe(Effect.zipRight(repeatedTask), Effect.asVoid)
    : repeatedTask;
}
