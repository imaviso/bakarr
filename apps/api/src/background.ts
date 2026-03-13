import { Cause, Context, Effect, Fiber, Layer, Ref, Schedule } from "effect";

import type { DownloadStatus } from "../../../packages/shared/src/index.ts";
import { buildBackgroundSchedule } from "./background-schedule.ts";
import { DatabaseError } from "./db/database.ts";
import {
  compactLogAnnotations,
  durationMsSince,
  errorLogAnnotations,
} from "./lib/logging.ts";
import { EventBus } from "./features/events/event-bus.ts";
import {
  DownloadService,
  LibraryService,
  RssService,
} from "./features/operations/service.ts";
import { SystemService } from "./features/system/service.ts";

export const BACKGROUND_WORKER_NAMES = [
  "download_sync",
  "rss",
  "library_scan",
] as const;

export type BackgroundWorkerName = (typeof BACKGROUND_WORKER_NAMES)[number];

export interface BackgroundWorkerStats {
  readonly daemonRunning: boolean;
  readonly failureCount: number;
  readonly lastErrorMessage: string | null;
  readonly lastFailedAt: string | null;
  readonly lastStartedAt: string | null;
  readonly lastSucceededAt: string | null;
  readonly runRunning: boolean;
  readonly skipCount: number;
  readonly successCount: number;
}

export type BackgroundWorkerSnapshot = Record<
  BackgroundWorkerName,
  BackgroundWorkerStats
>;

export interface BackgroundWorkerMonitorShape {
  readonly markDaemonStarted: (
    workerName: BackgroundWorkerName,
  ) => Effect.Effect<void>;
  readonly markDaemonStopped: (
    workerName: BackgroundWorkerName,
  ) => Effect.Effect<void>;
  readonly markRunFailed: (
    workerName: BackgroundWorkerName,
    error: string,
  ) => Effect.Effect<void>;
  readonly markRunInterrupted: (
    workerName: BackgroundWorkerName,
  ) => Effect.Effect<void>;
  readonly markRunSkipped: (
    workerName: BackgroundWorkerName,
  ) => Effect.Effect<void>;
  readonly markRunStarted: (
    workerName: BackgroundWorkerName,
  ) => Effect.Effect<void>;
  readonly markRunSucceeded: (
    workerName: BackgroundWorkerName,
  ) => Effect.Effect<void>;
  readonly snapshot: () => Effect.Effect<BackgroundWorkerSnapshot>;
}

export class BackgroundWorkerMonitor
  extends Context.Tag("@bakarr/api/BackgroundWorkerMonitor")<
    BackgroundWorkerMonitor,
    BackgroundWorkerMonitorShape
  >() {}

export interface BackgroundWorkerHandle {
  readonly stop: Effect.Effect<void>;
}

export interface BackgroundWorkerServiceShape {
  readonly start: () => Effect.Effect<BackgroundWorkerHandle, DatabaseError>;
}

export class BackgroundWorkerService
  extends Context.Tag("@bakarr/api/BackgroundWorkerService")<
    BackgroundWorkerService,
    BackgroundWorkerServiceShape
  >() {}

function emptyBackgroundWorkerStats(): BackgroundWorkerStats {
  return {
    daemonRunning: false,
    failureCount: 0,
    lastErrorMessage: null,
    lastFailedAt: null,
    lastStartedAt: null,
    lastSucceededAt: null,
    runRunning: false,
    skipCount: 0,
    successCount: 0,
  };
}

function initialBackgroundWorkerSnapshot(): BackgroundWorkerSnapshot {
  return {
    download_sync: emptyBackgroundWorkerStats(),
    library_scan: emptyBackgroundWorkerStats(),
    rss: emptyBackgroundWorkerStats(),
  };
}

function nowIso() {
  return new Date().toISOString();
}

export function makeBackgroundWorkerMonitor() {
  return Effect.gen(function* () {
    const state = yield* Ref.make(initialBackgroundWorkerSnapshot());

    const updateWorker = (
      workerName: BackgroundWorkerName,
      update: (stats: BackgroundWorkerStats) => BackgroundWorkerStats,
    ) =>
      Ref.update(state, (current) => ({
        ...current,
        [workerName]: update(current[workerName]),
      }));

    return {
      markDaemonStarted: (workerName: BackgroundWorkerName) =>
        updateWorker(workerName, (stats) => ({
          ...stats,
          daemonRunning: true,
        })),
      markDaemonStopped: (workerName: BackgroundWorkerName) =>
        updateWorker(workerName, (stats) => ({
          ...stats,
          daemonRunning: false,
          runRunning: false,
        })),
      markRunFailed: (workerName: BackgroundWorkerName, error: string) =>
        updateWorker(workerName, (stats) => ({
          ...stats,
          failureCount: stats.failureCount + 1,
          lastErrorMessage: error,
          lastFailedAt: nowIso(),
          runRunning: false,
        })),
      markRunInterrupted: (workerName: BackgroundWorkerName) =>
        updateWorker(workerName, (stats) => ({
          ...stats,
          runRunning: false,
        })),
      markRunSkipped: (workerName: BackgroundWorkerName) =>
        updateWorker(workerName, (stats) => ({
          ...stats,
          skipCount: stats.skipCount + 1,
        })),
      markRunStarted: (workerName: BackgroundWorkerName) =>
        updateWorker(workerName, (stats) => ({
          ...stats,
          lastStartedAt: nowIso(),
          runRunning: true,
        })),
      markRunSucceeded: (workerName: BackgroundWorkerName) =>
        updateWorker(workerName, (stats) => ({
          ...stats,
          lastSucceededAt: nowIso(),
          runRunning: false,
          successCount: stats.successCount + 1,
        })),
      snapshot: () => Ref.get(state),
    } satisfies BackgroundWorkerMonitorShape;
  });
}

const makeBackgroundWorkerService = Effect.gen(function* () {
  const system = yield* SystemService;
  const eventBus = yield* EventBus;
  const monitor = yield* BackgroundWorkerMonitor;
  const downloadService = yield* DownloadService;
  const libraryService = yield* LibraryService;
  const rssService = yield* RssService;

  const start = Effect.fn("BackgroundWorkerService.start")(function* () {
    const config = yield* system.getConfig();
    const schedule = buildBackgroundSchedule(config);

    const rssLoop = yield* withLockEffect(
      "rss",
      Effect.gen(function* () {
        yield* rssService.runRssCheck();
        yield* downloadService.triggerSearchMissing();
      }),
      monitor,
    );

    const libraryLoop = yield* withLockEffect(
      "library_scan",
      libraryService.runLibraryScan(),
      monitor,
    );

    const downloadSyncLoop = yield* withLockEffect(
      "download_sync",
      Effect.gen(function* () {
        const downloads: DownloadStatus[] = yield* downloadService
          .getDownloadProgress();
        yield* eventBus.publish({
          type: "DownloadProgress",
          payload: { downloads },
        });
      }),
      monitor,
    );

    const spawnedFibers: Fiber.Fiber<void, never>[] = [
      yield* forkSupervisedWorker(
        "download_sync",
        repeatWorker(downloadSyncLoop, {
          intervalMs: schedule.downloadSyncMs,
        }),
        monitor,
      ),
    ];

    if (schedule.rssCronExpression !== null || schedule.rssCheckMs !== null) {
      spawnedFibers.push(
        yield* forkSupervisedWorker(
          "rss",
          repeatWorker(rssLoop, {
            cronExpression: schedule.rssCronExpression,
            initialDelayMs: schedule.initialDelayMs,
            intervalMs: schedule.rssCheckMs ?? undefined,
          }),
          monitor,
        ),
      );
    }

    if (schedule.libraryScanMs !== null) {
      spawnedFibers.push(
        yield* forkSupervisedWorker(
          "library_scan",
          repeatWorker(libraryLoop, {
            initialDelayMs: schedule.initialDelayMs,
            intervalMs: schedule.libraryScanMs,
          }),
          monitor,
        ),
      );
    }

    return {
      stop: Fiber.interruptAll(spawnedFibers).pipe(Effect.asVoid),
    } satisfies BackgroundWorkerHandle;
  });

  return {
    start,
  } satisfies BackgroundWorkerServiceShape;
});

export const BackgroundWorkerServiceLive = Layer.effect(
  BackgroundWorkerService,
  makeBackgroundWorkerService,
);

export const BackgroundWorkerMonitorLive = Layer.effect(
  BackgroundWorkerMonitor,
  makeBackgroundWorkerMonitor(),
);

function withLockEffect<A, E, R>(
  workerName: BackgroundWorkerName,
  task: Effect.Effect<A, E, R>,
  monitor: BackgroundWorkerMonitorShape,
): Effect.Effect<Effect.Effect<void, never, R>> {
  return Effect.gen(function* () {
    const semaphore = yield* Effect.makeSemaphore(1);
    const lockedTask: Effect.Effect<void, never, R> = Effect.gen(function* () {
      let acquired = false;

      try {
        acquired = yield* semaphore.take(1).pipe(
          Effect.as(true),
          Effect.timeout("1 millis"),
          Effect.catchTag("TimeoutException", () => Effect.succeed(false)),
        );

        if (!acquired) {
          yield* monitor.markRunSkipped(workerName);
          return;
        }

        const startedAt = performance.now();
        yield* monitor.markRunStarted(workerName);

        const exit = yield* Effect.exit(task);

        if (exit._tag === "Success") {
          yield* monitor.markRunSucceeded(workerName);
        } else if (Cause.isInterruptedOnly(exit.cause)) {
          yield* monitor.markRunInterrupted(workerName);
        } else {
          const prettyCause = Cause.pretty(exit.cause);

          yield* monitor.markRunFailed(workerName, prettyCause);
          yield* Effect.logError("background worker failed").pipe(
            Effect.annotateLogs(
              compactLogAnnotations({
                component: "background",
                durationMs: durationMsSince(startedAt),
                event: "background.worker.failed",
                workerName,
                ...errorLogAnnotations(prettyCause),
              }),
            ),
          );
        }

        return;
      } finally {
        if (acquired) {
          yield* semaphore.release(1);
        }
      }
    }).pipe(Effect.withSpan(`background.${workerName}`));

    return yield* Effect.succeed(lockedTask);
  });
}

function forkSupervisedWorker(
  workerName: BackgroundWorkerName,
  task: Effect.Effect<void, never>,
  monitor: BackgroundWorkerMonitorShape,
) {
  return Effect.gen(function* () {
    yield* monitor.markDaemonStarted(workerName);

    return yield* Effect.forkDaemon(
      task.pipe(
        Effect.ensuring(monitor.markDaemonStopped(workerName)),
        Effect.withSpan(`background.loop.${workerName}`),
      ),
    );
  });
}

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
      Effect.zipRight(
        task.pipe(Effect.repeat(Schedule.cron(options.cronExpression))),
      ),
      Effect.asVoid,
    );
  }

  return initialRun.pipe(
    Effect.zipRight(
      task.pipe(
        Effect.repeat(Schedule.spaced(`${options.intervalMs ?? 0} millis`)),
      ),
    ),
    Effect.asVoid,
  );
}
