import { Cause, Effect, Option, Schedule, Schema } from "effect";
import { Exit } from "effect";
import type { Scope } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { BackgroundWorkerSpawner } from "@/background-controller-core.ts";
import { buildBackgroundSchedule } from "@/background-schedule.ts";
import type { BackgroundTaskRunnerShape } from "@/background-task-runner.ts";
import type { BackgroundWorkerMonitorShape } from "@/background-monitor.ts";
import { type BackgroundWorkerName } from "@/background-worker-model.ts";
import type { ClockServiceShape } from "@/lib/clock.ts";
import { makeSkippingSerializedEffectRunner } from "@/lib/effect-coalescing.ts";
import { compactLogAnnotations, durationMsSince, errorLogAnnotations } from "@/lib/logging.ts";

export class WorkerTimeoutError extends Schema.TaggedError<WorkerTimeoutError>()(
  "WorkerTimeoutError",
  {
    workerName: Schema.String,
    timeoutMs: Schema.Number,
    message: Schema.String,
  },
) {}

const WORKER_TIMEOUTS: Record<BackgroundWorkerName, number> = {
  download_sync: 30_000,
  library_scan: 300_000,
  metadata_refresh: 60_000,
  rss: 120_000,
};

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
      return yield* Effect.die(Cause.squash(exit.cause));
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

  const resilientRun = <E>(workerName: BackgroundWorkerName, task: Effect.Effect<void, E>) =>
    task.pipe(
      Effect.exit,
      Effect.flatMap((exit) => keepWorkerAlive(workerName, exit)),
    );

  return Effect.fn("Background.spawnWorkersFromConfig")(function* (
    workerScope: Scope.Scope,
    config: Config,
  ) {
    const schedule = buildBackgroundSchedule(config);
    const downloadSyncLoop = resilientRun("download_sync", taskRunner.runDownloadSyncWorkerTask());
    const rssLoop = resilientRun("rss", taskRunner.runRssWorkerTask());
    const libraryLoop = resilientRun("library_scan", taskRunner.runLibraryScanWorkerTask());
    const metadataRefreshLoop = resilientRun(
      "metadata_refresh",
      taskRunner.runMetadataRefreshWorkerTask(),
    );

    yield* forkSupervisedWorker(
      workerScope,
      "download_sync",
      repeatWorker(downloadSyncLoop, {
        intervalMs: schedule.downloadSyncMs,
      }),
      monitor,
    );

    if (schedule.rssCronExpression !== null || schedule.rssCheckMs !== null) {
      yield* forkSupervisedWorker(
        workerScope,
        "rss",
        repeatWorker(rssLoop, {
          cronExpression: schedule.rssCronExpression,
          initialDelayMs: schedule.initialDelayMs,
          intervalMs: schedule.rssCheckMs ?? undefined,
        }),
        monitor,
      );
    }

    if (schedule.libraryScanMs !== null) {
      yield* forkSupervisedWorker(
        workerScope,
        "library_scan",
        repeatWorker(libraryLoop, {
          initialDelayMs: schedule.initialDelayMs,
          intervalMs: schedule.libraryScanMs,
        }),
        monitor,
      );
    }

    if (schedule.metadataRefreshMs !== null) {
      yield* forkSupervisedWorker(
        workerScope,
        "metadata_refresh",
        repeatWorker(metadataRefreshLoop, {
          initialDelayMs: schedule.initialDelayMs,
          intervalMs: schedule.metadataRefreshMs,
        }),
        monitor,
      );
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
  const effectiveTimeout = timeoutMs ?? WORKER_TIMEOUTS[workerName];
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

  const runner = yield* makeSkippingSerializedEffectRunner(
    Effect.gen(function* () {
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

      const timeoutError = getWorkerTimeoutError(exit.cause);
      const errorMessage = timeoutError?.message ?? Cause.pretty(exit.cause);

      yield* monitor.markRunFailed(workerName, errorMessage, durationMs);
      yield* Effect.logError(
        timeoutError ? "background worker timed out" : "background worker failed",
      ).pipe(
        Effect.annotateLogs(
          compactLogAnnotations({
            cause: Cause.pretty(exit.cause),
            component: "background",
            durationMs,
            event: timeoutError ? "background.worker.timeout" : "background.worker.failed",
            timeoutMs: timeoutError?.timeoutMs,
            workerName,
            ...errorLogAnnotations(errorMessage),
          }),
        ),
      );

      if (Cause.isDie(exit.cause)) {
        return yield* Effect.die(Cause.squash(exit.cause));
      }

      return yield* Effect.failCause(exit.cause);
    }),
  );

  const lockedTask = Effect.gen(function* () {
    const result = yield* runner.trigger;

    if (Option.isNone(result)) {
      yield* monitor.markRunSkipped(workerName);
      return;
    }
  });

  return lockedTask;
});

function getWorkerTimeoutError(cause: Cause.Cause<unknown>) {
  const failure = Cause.failureOption(cause);

  if (Option.isSome(failure) && failure.value instanceof WorkerTimeoutError) {
    return failure.value;
  }

  return null;
}

export const forkSupervisedWorker = Effect.fn("Background.forkSupervisedWorker")(function* (
  scope: Scope.Scope,
  workerName: BackgroundWorkerName,
  task: Effect.Effect<void, never>,
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
  task: Effect.Effect<void, never>,
  options: {
    readonly cronExpression?: string | null;
    readonly initialDelayMs?: number;
    readonly intervalMs?: number;
  },
) {
  const initialDelay = options.initialDelayMs ?? 0;
  const initialRun = Effect.gen(function* () {
    if (initialDelay > 0) {
      yield* Effect.sleep(`${initialDelay} millis`);
    }

    yield* task;
  });

  if (options.cronExpression) {
    return initialRun.pipe(
      Effect.zipRight(task.pipe(Effect.repeat(Schedule.cron(options.cronExpression)))),
      Effect.asVoid,
    );
  }

  return initialRun.pipe(
    Effect.zipRight(task.pipe(Effect.repeat(Schedule.spaced(`${options.intervalMs ?? 0} millis`)))),
    Effect.asVoid,
  );
}
