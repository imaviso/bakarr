import * as Cron from "effect/Cron";
import { Effect, Either, Fiber, Schedule } from "effect";

import type {
  Config,
  DownloadStatus,
} from "../../../packages/shared/src/index.ts";
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
import { type ApiRuntime, runApi } from "./runtime.ts";

const DEFAULT_DOWNLOAD_SYNC_MS = 15_000;

export interface BackgroundWorkers {
  readonly stop: () => void;
}

export interface BackgroundSchedule {
  readonly initialDelayMs: number;
  readonly downloadSyncMs: number;
  readonly libraryScanMs: number | null;
  readonly rssCronExpression: string | null;
  readonly rssCheckMs: number | null;
}

export function buildBackgroundSchedule(config: Config): BackgroundSchedule {
  const cronExpression = config.scheduler.enabled
    ? config.scheduler.cron_expression?.trim() || null
    : null;
  const parsedCron = cronExpression ? Cron.parse(cronExpression) : null;
  const rssCronExpression = parsedCron && Either.isRight(parsedCron)
    ? cronExpression
    : null;

  return {
    initialDelayMs: Math.max(config.scheduler.check_delay_seconds, 0) * 1000,
    downloadSyncMs: DEFAULT_DOWNLOAD_SYNC_MS,
    libraryScanMs: config.library.auto_scan_interval_hours > 0
      ? config.library.auto_scan_interval_hours * 60 * 60 * 1000
      : null,
    rssCronExpression,
    rssCheckMs: config.scheduler.enabled && !rssCronExpression &&
        config.scheduler.check_interval_minutes > 0
      ? config.scheduler.check_interval_minutes * 60 * 1000
      : null,
  };
}

export async function startBackgroundWorkers(
  runtime: ApiRuntime,
): Promise<BackgroundWorkers> {
  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    runApi(runtime, effect);
  const config = await run(
    Effect.flatMap(SystemService, (service) => service.getConfig()),
  ) as Config;
  const schedule = buildBackgroundSchedule(config);
  const rssLoop = withLockEffect(
    "rss",
    Effect.gen(function* () {
      yield* Effect.flatMap(
        RssService,
        (service) => service.runRssCheck(),
      );
      yield* Effect.flatMap(
        DownloadService,
        (service) => service.triggerSearchMissing(),
      );
    }),
  );

  const libraryLoop = withLockEffect(
    "library_scan",
    Effect.flatMap(LibraryService, (service) => service.runLibraryScan()),
  );

  const downloadSyncLoop = withLockEffect(
    "download_sync",
    Effect.gen(function* () {
      const downloads: DownloadStatus[] = yield* Effect.flatMap(
        DownloadService,
        (service) => service.getDownloadProgress(),
      );

      yield* Effect.flatMap(
        EventBus,
        (bus) =>
          bus.publish({ type: "DownloadProgress", payload: { downloads } }),
      );
    }),
  );

  const fibers = [
    runtime.runFork(
      repeatWorker(downloadSyncLoop, { intervalMs: schedule.downloadSyncMs }),
    ),
  ];

  if (schedule.rssCronExpression !== null || schedule.rssCheckMs !== null) {
    fibers.push(
      runtime.runFork(
        repeatWorker(rssLoop, {
          cronExpression: schedule.rssCronExpression,
          initialDelayMs: schedule.initialDelayMs,
          intervalMs: schedule.rssCheckMs ?? undefined,
        }),
      ),
    );
  }

  if (schedule.libraryScanMs !== null) {
    fibers.push(
      runtime.runFork(
        repeatWorker(libraryLoop, {
          initialDelayMs: schedule.initialDelayMs,
          intervalMs: schedule.libraryScanMs,
        }),
      ),
    );
  }

  return {
    stop: () => {
      void runApi(runtime, Fiber.interruptAll(fibers).pipe(Effect.asVoid))
        .catch(() => undefined);
    },
  };
}

function withLockEffect<A, E, R>(
  workerName: string,
  task: Effect.Effect<A, E, R>,
) {
  let running = false;

  return Effect.fn(`background.${workerName}`)(function* () {
    if (running) {
      return;
    }

    running = true;
    const startedAt = performance.now();

    try {
      yield* task;
    } catch (error) {
      yield* Effect.logError("background worker failed").pipe(
        Effect.annotateLogs(
          compactLogAnnotations({
            component: "background",
            durationMs: durationMsSince(startedAt),
            event: "background.worker.failed",
            workerName,
            ...errorLogAnnotations(error),
          }),
        ),
      );
    } finally {
      running = false;
    }
  })().pipe(Effect.catchAll(() => Effect.void));
}

function repeatWorker(
  task:
    | Effect.Effect<void, never, never>
    | Effect.Effect<void, never, EventBus | DownloadService | LibraryService | RssService>,
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
    Effect.zipRight(
      task.pipe(Effect.repeat(Schedule.spaced(`${options.intervalMs ?? 0} millis`))),
    ),
    Effect.asVoid,
  );
}
