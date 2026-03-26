import { Cause, Context, Effect, Layer, Option, Ref, Schedule, Scope } from "effect";

import type { Config, DownloadStatus } from "../../../packages/shared/src/index.ts";
import {
  BACKGROUND_WORKER_NAMES,
  type BackgroundWorkerName,
  type BackgroundWorkerSnapshot,
  BackgroundWorkerSnapshotModel,
  type BackgroundWorkerStats,
  BackgroundWorkerStatsModel,
  initialBackgroundWorkerSnapshot,
} from "./background-worker-model.ts";
import { buildBackgroundSchedule } from "./background-schedule.ts";
import { DatabaseError } from "./db/database.ts";
import { nowIsoFromClock, ClockService, type ClockServiceShape } from "./lib/clock.ts";
import { makeSkippingSerializedEffectRunner } from "./lib/effect-coalescing.ts";
import { compactLogAnnotations, durationMsSince, errorLogAnnotations } from "./lib/logging.ts";
import { makeReloadableScopedController } from "./lib/reloadable-scoped-controller.ts";
import {
  preRegisterBackgroundWorkerMetrics,
  recordBackgroundWorkerRun,
  setBackgroundWorkerDaemonRunning,
  setBackgroundWorkerRunRunning,
} from "./lib/metrics.ts";
import { EventBus, type EventBusShape } from "./features/events/event-bus.ts";
import {
  DownloadService,
  type DownloadServiceShape,
  LibraryService,
  type LibraryServiceShape,
  RssService,
  type RssServiceShape,
} from "./features/operations/service.ts";
import { AnimeService, type AnimeServiceShape } from "./features/anime/service.ts";

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

export interface WorkersDeps {
  readonly eventBus: EventBusShape;
  readonly monitor: BackgroundWorkerMonitorShape;
  readonly animeService: AnimeServiceShape;
  readonly downloadService: DownloadServiceShape;
  readonly libraryService: LibraryServiceShape;
  readonly rssService: RssServiceShape;
  readonly clock: ClockServiceShape;
}

export const spawnWorkersFromConfig = Effect.fn("Background.spawnWorkersFromConfig")(function* (
  workerScope: Scope.Scope,
  config: Config,
  deps: WorkersDeps,
) {
  const { animeService, eventBus, monitor, downloadService, libraryService, rssService, clock } =
    deps;
  const schedule = buildBackgroundSchedule(config);
  const runRssWorkerTask = Effect.fn("Background.runRssWorkerTask")(function* () {
    yield* rssService.runRssCheck();
    yield* downloadService.triggerSearchMissing();
  });
  const runDownloadSyncWorkerTask = Effect.fn("Background.runDownloadSyncWorkerTask")(function* () {
    yield* downloadService.syncDownloads();
    const downloads: DownloadStatus[] = yield* downloadService.getDownloadProgress();
    yield* eventBus.publish({
      type: "DownloadProgress",
      payload: { downloads },
    });
  });

  const rssLoop = yield* withLockEffect("rss", runRssWorkerTask(), monitor, clock);

  const libraryLoop = yield* withLockEffect(
    "library_scan",
    libraryService.runLibraryScan(),
    monitor,
    clock,
  );

  const metadataRefreshLoop = yield* withLockEffect(
    "metadata_refresh",
    animeService.refreshMetadataForMonitoredAnime().pipe(Effect.asVoid),
    monitor,
    clock,
  );

  const downloadSyncLoop = yield* withLockEffect(
    "download_sync",
    runDownloadSyncWorkerTask(),
    monitor,
    clock,
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

export const BackgroundWorkerMonitorLive = Layer.effect(
  BackgroundWorkerMonitor,
  Effect.flatMap(ClockService, makeBackgroundWorkerMonitor),
);

const withLockEffect = Effect.fn("Background.withLockEffect")(function* <A, E, R>(
  workerName: BackgroundWorkerName,
  task: Effect.Effect<A, E, R>,
  monitor: BackgroundWorkerMonitorShape,
  clock: typeof ClockService.Service,
) {
  const runner = yield* makeSkippingSerializedEffectRunner(
    Effect.gen(function* () {
      const startedAt = yield* clock.currentMonotonicMillis;
      yield* monitor.markRunStarted(workerName);

      const exit = yield* Effect.exit(task);
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

      const prettyCause = Cause.pretty(exit.cause);

      yield* monitor.markRunFailed(workerName, prettyCause, durationMs);
      yield* Effect.logError("background worker failed").pipe(
        Effect.annotateLogs(
          compactLogAnnotations({
            component: "background",
            durationMs,
            event: "background.worker.failed",
            workerName,
            ...errorLogAnnotations(prettyCause),
          }),
        ),
      );

      if (Cause.isDie(exit.cause)) {
        return yield* Effect.die(Cause.squash(exit.cause));
      }
    }),
  );

  const lockedTask: Effect.Effect<void, never, R> = Effect.gen(function* () {
    const result = yield* runner.trigger;

    if (Option.isNone(result)) {
      yield* monitor.markRunSkipped(workerName);
      return;
    }
  });

  return yield* Effect.succeed(lockedTask);
});

const forkSupervisedWorker = Effect.fn("Background.forkSupervisedWorker")(function* (
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

function repeatWorker(
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

export interface BackgroundWorkerControllerShape {
  readonly isStarted: () => Effect.Effect<boolean>;
  readonly start: (config: Config) => Effect.Effect<void, DatabaseError>;
  readonly reload: (config: Config) => Effect.Effect<void, DatabaseError>;
  readonly stop: () => Effect.Effect<void>;
}

export class BackgroundWorkerController extends Context.Tag(
  "@bakarr/api/BackgroundWorkerController",
)<BackgroundWorkerController, BackgroundWorkerControllerShape>() {}

export interface BackgroundWorkerSpawner {
  (scope: Scope.Scope, config: Config): Effect.Effect<void, DatabaseError>;
}

export const makeBackgroundWorkerController = Effect.fn(
  "Background.makeBackgroundWorkerController",
)(function* (options: { readonly spawnWorkers: BackgroundWorkerSpawner }) {
  return yield* makeReloadableScopedController({
    spawn: options.spawnWorkers,
  });
});

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const monitor = yield* BackgroundWorkerMonitor;
  const animeService = yield* AnimeService;
  const downloadService = yield* DownloadService;
  const libraryService = yield* LibraryService;
  const rssService = yield* RssService;

  const deps: WorkersDeps = {
    animeService,
    clock,
    eventBus,
    monitor,
    downloadService,
    libraryService,
    rssService,
  };

  const spawnWorkers: BackgroundWorkerSpawner = (scope, config) =>
    spawnWorkersFromConfig(scope, config, deps);

  const controller = yield* makeBackgroundWorkerController({
    spawnWorkers,
  });

  yield* Effect.addFinalizer(() => controller.stop());

  return controller;
});

export const BackgroundWorkerControllerLive = Layer.scoped(
  BackgroundWorkerController,
  makeBackgroundWorkerControllerLive,
);
