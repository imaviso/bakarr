import { Cause, Context, Effect, Fiber, Layer, Ref, Schedule } from "effect";

import type {
  Config,
  DownloadStatus,
} from "../../../packages/shared/src/index.ts";
import { buildBackgroundSchedule } from "./background-schedule.ts";
import { DatabaseError } from "./db/database.ts";
import {
  compactLogAnnotations,
  durationMsSince,
  errorLogAnnotations,
} from "./lib/logging.ts";
import { EventBus, type EventBusShape } from "./features/events/event-bus.ts";
import {
  DownloadService,
  type DownloadServiceShape,
  LibraryService,
  type LibraryServiceShape,
  RssService,
  type RssServiceShape,
} from "./features/operations/service.ts";

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

export interface WorkersDeps {
  readonly eventBus: EventBusShape;
  readonly monitor: BackgroundWorkerMonitorShape;
  readonly downloadService: DownloadServiceShape;
  readonly libraryService: LibraryServiceShape;
  readonly rssService: RssServiceShape;
}

export function spawnWorkersFromConfig(
  config: Config,
  deps: WorkersDeps,
): Effect.Effect<BackgroundWorkerHandle, never, never> {
  const { eventBus, monitor, downloadService, libraryService, rssService } =
    deps;
  const schedule = buildBackgroundSchedule(config);

  return Effect.gen(function* () {
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
}

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

export interface BackgroundWorkerControllerShape {
  readonly isStarted: () => Effect.Effect<boolean>;
  readonly start: (config: Config) => Effect.Effect<void, DatabaseError>;
  readonly reload: (config: Config) => Effect.Effect<void, DatabaseError>;
  readonly stop: () => Effect.Effect<void>;
}

export class BackgroundWorkerController
  extends Context.Tag("@bakarr/api/BackgroundWorkerController")<
    BackgroundWorkerController,
    BackgroundWorkerControllerShape
  >() {}

export interface BackgroundWorkerSpawner {
  (config: Config): Effect.Effect<BackgroundWorkerHandle, DatabaseError>;
}

export function makeBackgroundWorkerController(options: {
  readonly monitor: BackgroundWorkerMonitorShape;
  readonly spawnWorkers: BackgroundWorkerSpawner;
}) {
  return Effect.gen(function* () {
    const handleRef = yield* Ref.make<BackgroundWorkerHandle | null>(null);
    const lifecycleSemaphore = yield* Effect.makeSemaphore(1);

    const isStarted = () =>
      Ref.get(handleRef).pipe(Effect.map((h) => h !== null));

    const start = (config: Config) =>
      lifecycleSemaphore.withPermits(1)(
        Effect.gen(function* () {
          const current = yield* Ref.get(handleRef);
          if (current !== null) {
            return;
          }
          const handle = yield* options.spawnWorkers(config);
          yield* Ref.set(handleRef, handle);
        }),
      );

    const reload = (config: Config) =>
      lifecycleSemaphore.withPermits(1)(
        Effect.gen(function* () {
          const oldHandle = yield* Ref.get(handleRef);
          if (oldHandle === null) {
            return;
          }
          const newHandle = yield* options.spawnWorkers(config);
          yield* Ref.set(handleRef, newHandle);
          yield* oldHandle.stop;
        }),
      );

    const stop = () =>
      lifecycleSemaphore.withPermits(1)(
        Effect.gen(function* () {
          const current = yield* Ref.getAndSet(handleRef, null);
          if (current !== null) {
            yield* current.stop;
          }
        }),
      );

    return {
      isStarted,
      start,
      reload,
      stop,
    } satisfies BackgroundWorkerControllerShape;
  });
}

const makeBackgroundWorkerControllerLive = Effect.gen(function* () {
  const eventBus = yield* EventBus;
  const monitor = yield* BackgroundWorkerMonitor;
  const downloadService = yield* DownloadService;
  const libraryService = yield* LibraryService;
  const rssService = yield* RssService;

  const deps: WorkersDeps = {
    eventBus,
    monitor,
    downloadService,
    libraryService,
    rssService,
  };

  const spawnWorkers: BackgroundWorkerSpawner = (config) =>
    spawnWorkersFromConfig(config, deps);

  return yield* makeBackgroundWorkerController({ monitor, spawnWorkers });
});

export const BackgroundWorkerControllerLive = Layer.effect(
  BackgroundWorkerController,
  makeBackgroundWorkerControllerLive,
);
