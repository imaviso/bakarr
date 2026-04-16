import { Context, Effect, Layer, Ref } from "effect";

import {
  BACKGROUND_WORKER_NAMES,
  type BackgroundWorkerName,
  type BackgroundWorkerSnapshot,
  type BackgroundWorkerStats,
  BackgroundWorkerStatsModel,
  initialBackgroundWorkerSnapshot,
  updateWorkerInSnapshot,
} from "@/background-worker-model.ts";
import { ClockService, isoStringFromMillis } from "@/lib/clock.ts";
import {
  preRegisterBackgroundWorkerMetrics,
  recordBackgroundWorkerRun,
  setBackgroundWorkerDaemonRunning,
  setBackgroundWorkerRunRunning,
} from "@/lib/metrics.ts";

export interface BackgroundWorkerMonitorShape {
  readonly markDaemonStarted: (workerName: BackgroundWorkerName) => Effect.Effect<void>;
  readonly markDaemonStopped: (workerName: BackgroundWorkerName) => Effect.Effect<void>;
  readonly markRunFailed: (
    workerName: BackgroundWorkerName,
    error: string,
    durationMs?: number,
  ) => Effect.Effect<void>;
  readonly markRunInterrupted: (workerName: BackgroundWorkerName) => Effect.Effect<void>;
  readonly markRunSkipped: (workerName: BackgroundWorkerName) => Effect.Effect<void>;
  readonly markRunStarted: (workerName: BackgroundWorkerName) => Effect.Effect<void>;
  readonly markRunSucceeded: (
    workerName: BackgroundWorkerName,
    durationMs?: number,
  ) => Effect.Effect<void>;
  readonly snapshot: () => Effect.Effect<BackgroundWorkerSnapshot>;
}

export class BackgroundWorkerMonitor extends Context.Tag("@bakarr/api/BackgroundWorkerMonitor")<
  BackgroundWorkerMonitor,
  BackgroundWorkerMonitorShape
>() {}

export const makeBackgroundWorkerMonitor = Effect.fn("Background.makeBackgroundWorkerMonitor")(
  function* () {
    const clock = yield* ClockService;
    const state = yield* Ref.make(initialBackgroundWorkerSnapshot());
    yield* preRegisterBackgroundWorkerMetrics(BACKGROUND_WORKER_NAMES);

    const updateWorker = (
      workerName: BackgroundWorkerName,
      update: (stats: BackgroundWorkerStats) => BackgroundWorkerStats,
    ) => Ref.update(state, (current) => updateWorkerInSnapshot(current, workerName, update));

    const mergeWorkerStats = (
      stats: BackgroundWorkerStats,
      patch: Partial<BackgroundWorkerStats>,
    ) =>
      new BackgroundWorkerStatsModel({
        daemonRunning: patch.daemonRunning ?? stats.daemonRunning,
        failureCount: patch.failureCount ?? stats.failureCount,
        lastErrorMessage: patch.lastErrorMessage ?? stats.lastErrorMessage,
        lastFailedAt: patch.lastFailedAt ?? stats.lastFailedAt,
        lastStartedAt: patch.lastStartedAt ?? stats.lastStartedAt,
        lastSucceededAt: patch.lastSucceededAt ?? stats.lastSucceededAt,
        runRunning: patch.runRunning ?? stats.runRunning,
        skipCount: patch.skipCount ?? stats.skipCount,
        successCount: patch.successCount ?? stats.successCount,
      });

    const markRunFailed = Effect.fn("BackgroundWorkerMonitor.markRunFailed")(function* (
      workerName: BackgroundWorkerName,
      error: string,
      durationMs?: number,
    ) {
      const now = yield* Effect.map(clock.currentTimeMillis, isoStringFromMillis);
      yield* updateWorker(workerName, (stats) =>
        mergeWorkerStats(stats, {
          failureCount: stats.failureCount + 1,
          lastErrorMessage: error,
          lastFailedAt: now,
          runRunning: false,
        }),
      );
      yield* setBackgroundWorkerRunRunning(workerName, false);
      yield* recordBackgroundWorkerRun({
        ...(durationMs !== undefined ? { durationMs } : {}),
        status: "failure",
        worker: workerName,
      });
    });

    const markRunStarted = Effect.fn("BackgroundWorkerMonitor.markRunStarted")(function* (
      workerName: BackgroundWorkerName,
    ) {
      const now = yield* Effect.map(clock.currentTimeMillis, isoStringFromMillis);
      yield* updateWorker(workerName, (stats) =>
        mergeWorkerStats(stats, { lastStartedAt: now, runRunning: true }),
      );
      yield* setBackgroundWorkerRunRunning(workerName, true);
    });

    const markRunSucceeded = Effect.fn("BackgroundWorkerMonitor.markRunSucceeded")(function* (
      workerName: BackgroundWorkerName,
      durationMs?: number,
    ) {
      const now = yield* Effect.map(clock.currentTimeMillis, isoStringFromMillis);
      yield* updateWorker(workerName, (stats) =>
        mergeWorkerStats(stats, {
          lastSucceededAt: now,
          runRunning: false,
          successCount: stats.successCount + 1,
        }),
      );
      yield* setBackgroundWorkerRunRunning(workerName, false);
      yield* recordBackgroundWorkerRun({
        ...(durationMs !== undefined ? { durationMs } : {}),
        status: "success",
        worker: workerName,
      });
    });

    const markDaemonStarted = Effect.fn("BackgroundWorkerMonitor.markDaemonStarted")(function* (
      workerName: BackgroundWorkerName,
    ) {
      yield* updateWorker(workerName, (stats) => mergeWorkerStats(stats, { daemonRunning: true }));
      yield* setBackgroundWorkerDaemonRunning(workerName, true);
    });

    const markDaemonStopped = Effect.fn("BackgroundWorkerMonitor.markDaemonStopped")(function* (
      workerName: BackgroundWorkerName,
    ) {
      yield* updateWorker(workerName, (stats) =>
        mergeWorkerStats(stats, { daemonRunning: false, runRunning: false }),
      );
      yield* setBackgroundWorkerDaemonRunning(workerName, false);
      yield* setBackgroundWorkerRunRunning(workerName, false);
    });

    const markRunInterrupted = Effect.fn("BackgroundWorkerMonitor.markRunInterrupted")(function* (
      workerName: BackgroundWorkerName,
    ) {
      yield* updateWorker(workerName, (stats) => mergeWorkerStats(stats, { runRunning: false }));
      yield* setBackgroundWorkerRunRunning(workerName, false);
    });

    const markRunSkipped = Effect.fn("BackgroundWorkerMonitor.markRunSkipped")(function* (
      workerName: BackgroundWorkerName,
    ) {
      yield* updateWorker(workerName, (stats) =>
        mergeWorkerStats(stats, { skipCount: stats.skipCount + 1 }),
      );
      yield* recordBackgroundWorkerRun({ status: "skipped", worker: workerName });
    });

    const snapshot = Effect.fn("BackgroundWorkerMonitor.snapshot")(() => Ref.get(state));

    return {
      markDaemonStarted,
      markDaemonStopped,
      markRunFailed,
      markRunInterrupted,
      markRunSkipped,
      markRunStarted,
      markRunSucceeded,
      snapshot,
    } satisfies BackgroundWorkerMonitorShape;
  },
);

export const BackgroundWorkerMonitorLive = Layer.effect(
  BackgroundWorkerMonitor,
  makeBackgroundWorkerMonitor(),
);
