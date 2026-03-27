import { Context, Effect, Layer, Ref } from "effect";

import {
  BACKGROUND_WORKER_NAMES,
  type BackgroundWorkerName,
  type BackgroundWorkerSnapshot,
  BackgroundWorkerSnapshotModel,
  type BackgroundWorkerStats,
  BackgroundWorkerStatsModel,
  initialBackgroundWorkerSnapshot,
} from "./background-worker-model.ts";
import { ClockService, nowIsoFromClock, type ClockServiceShape } from "./lib/clock.ts";
import {
  preRegisterBackgroundWorkerMetrics,
  recordBackgroundWorkerRun,
  setBackgroundWorkerDaemonRunning,
  setBackgroundWorkerRunRunning,
} from "./lib/metrics.ts";

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
  function* (clock: ClockServiceShape) {
    const state = yield* Ref.make(initialBackgroundWorkerSnapshot());
    yield* preRegisterBackgroundWorkerMetrics(BACKGROUND_WORKER_NAMES);

    const updateWorker = (
      workerName: BackgroundWorkerName,
      update: (stats: BackgroundWorkerStats) => BackgroundWorkerStats,
    ) =>
      Ref.update(state, (current) => {
        const nextWorkerStats = update(current[workerName]);
        return new BackgroundWorkerSnapshotModel({
          download_sync: workerName === "download_sync" ? nextWorkerStats : current.download_sync,
          library_scan: workerName === "library_scan" ? nextWorkerStats : current.library_scan,
          metadata_refresh:
            workerName === "metadata_refresh" ? nextWorkerStats : current.metadata_refresh,
          rss: workerName === "rss" ? nextWorkerStats : current.rss,
        });
      });

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
      const now = yield* nowIsoFromClock(clock);
      yield* Effect.all(
        [
          updateWorker(workerName, (stats) =>
            mergeWorkerStats(stats, {
              failureCount: stats.failureCount + 1,
              lastErrorMessage: error,
              lastFailedAt: now,
              runRunning: false,
            }),
          ),
          setBackgroundWorkerRunRunning(workerName, false),
          recordBackgroundWorkerRun({ durationMs, status: "failure", worker: workerName }),
        ],
        { concurrency: "unbounded", discard: true },
      );
    });

    const markRunStarted = Effect.fn("BackgroundWorkerMonitor.markRunStarted")(function* (
      workerName: BackgroundWorkerName,
    ) {
      const now = yield* nowIsoFromClock(clock);
      yield* Effect.all(
        [
          updateWorker(workerName, (stats) =>
            mergeWorkerStats(stats, { lastStartedAt: now, runRunning: true }),
          ),
          setBackgroundWorkerRunRunning(workerName, true),
        ],
        { concurrency: "unbounded", discard: true },
      );
    });

    const markRunSucceeded = Effect.fn("BackgroundWorkerMonitor.markRunSucceeded")(function* (
      workerName: BackgroundWorkerName,
      durationMs?: number,
    ) {
      const now = yield* nowIsoFromClock(clock);
      yield* Effect.all(
        [
          updateWorker(workerName, (stats) =>
            mergeWorkerStats(stats, {
              lastSucceededAt: now,
              runRunning: false,
              successCount: stats.successCount + 1,
            }),
          ),
          setBackgroundWorkerRunRunning(workerName, false),
          recordBackgroundWorkerRun({ durationMs, status: "success", worker: workerName }),
        ],
        { concurrency: "unbounded", discard: true },
      );
    });

    return {
      markDaemonStarted: (workerName: BackgroundWorkerName) =>
        Effect.zipRight(
          updateWorker(workerName, (stats) => mergeWorkerStats(stats, { daemonRunning: true })),
          setBackgroundWorkerDaemonRunning(workerName, true),
        ),
      markDaemonStopped: (workerName: BackgroundWorkerName) =>
        Effect.all(
          [
            updateWorker(workerName, (stats) =>
              mergeWorkerStats(stats, { daemonRunning: false, runRunning: false }),
            ),
            setBackgroundWorkerDaemonRunning(workerName, false),
            setBackgroundWorkerRunRunning(workerName, false),
          ],
          { concurrency: "unbounded", discard: true },
        ),
      markRunFailed,
      markRunInterrupted: (workerName: BackgroundWorkerName) =>
        Effect.zipRight(
          updateWorker(workerName, (stats) => mergeWorkerStats(stats, { runRunning: false })),
          setBackgroundWorkerRunRunning(workerName, false),
        ),
      markRunSkipped: (workerName: BackgroundWorkerName) =>
        Effect.all(
          [
            updateWorker(workerName, (stats) =>
              mergeWorkerStats(stats, { skipCount: stats.skipCount + 1 }),
            ),
            recordBackgroundWorkerRun({ status: "skipped", worker: workerName }),
          ],
          { concurrency: "unbounded", discard: true },
        ),
      markRunStarted,
      markRunSucceeded,
      snapshot: () => Ref.get(state),
    } satisfies BackgroundWorkerMonitorShape;
  },
);

export const BackgroundWorkerMonitorLive = Layer.effect(
  BackgroundWorkerMonitor,
  Effect.flatMap(ClockService, makeBackgroundWorkerMonitor),
);
