import { Cause, Effect, Option, Schedule } from "effect";
import type { Scope } from "effect";

import type { Config, DownloadStatus } from "../../../packages/shared/src/index.ts";
import { buildBackgroundSchedule } from "./background-schedule.ts";
import type { BackgroundWorkerMonitorShape } from "./background-monitor.ts";
import { type BackgroundWorkerName } from "./background-worker-model.ts";
import type { DatabaseError } from "./db/database.ts";
import type { ClockServiceShape } from "./lib/clock.ts";
import { makeSkippingSerializedEffectRunner } from "./lib/effect-coalescing.ts";
import { compactLogAnnotations, durationMsSince, errorLogAnnotations } from "./lib/logging.ts";
import type { EventBusShape } from "./features/events/event-bus.ts";
import type { AnimeMutationServiceShape } from "./features/anime/service.ts";
import type {
  CatalogOrchestrationShape,
  SearchOrchestrationShape,
} from "./features/operations/operations-orchestration.ts";

export interface BackgroundWorkerSpawner<R = never> {
  (scope: Scope.Scope, config: Config): Effect.Effect<void, DatabaseError, R>;
}

export interface BackgroundWorkerDependencies {
  readonly animeService: Pick<AnimeMutationServiceShape, "refreshMetadataForMonitoredAnime">;
  readonly clock: ClockServiceShape;
  readonly downloadControlService: Pick<CatalogOrchestrationShape, "syncDownloads">;
  readonly downloadStatusService: Pick<CatalogOrchestrationShape, "getDownloadProgress">;
  readonly downloadTriggerService: Pick<SearchOrchestrationShape, "triggerSearchMissing">;
  readonly eventBus: Pick<EventBusShape, "publish">;
  readonly libraryService: Pick<CatalogOrchestrationShape, "runLibraryScan">;
  readonly monitor: BackgroundWorkerMonitorShape;
  readonly rssService: Pick<SearchOrchestrationShape, "runRssCheck">;
}

export const spawnWorkersFromConfig = Effect.fn("Background.spawnWorkersFromConfig")(function* (
  services: BackgroundWorkerDependencies,
  workerScope: Scope.Scope,
  config: Config,
) {
  const {
    animeService,
    clock,
    downloadControlService,
    downloadStatusService,
    downloadTriggerService,
    eventBus,
    libraryService,
    monitor,
    rssService,
  } = services;
  const schedule = buildBackgroundSchedule(config);
  const runRssWorkerTask = Effect.fn("Background.runRssWorkerTask")(function* () {
    yield* rssService.runRssCheck();
    yield* downloadTriggerService.triggerSearchMissing();
  });
  const runDownloadSyncWorkerTask = Effect.fn("Background.runDownloadSyncWorkerTask")(function* () {
    yield* downloadControlService.syncDownloads();
    const downloads: DownloadStatus[] = yield* downloadStatusService.getDownloadProgress();
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

export const withLockEffect = Effect.fn("Background.withLockEffect")(function* <A, E, R>(
  workerName: BackgroundWorkerName,
  task: Effect.Effect<A, E, R>,
  monitor: BackgroundWorkerMonitorShape,
  clock: ClockServiceShape,
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
