import { Context, Effect, Fiber, Layer, Schedule } from "effect";

import type {
  Config,
  DownloadStatus,
} from "../../../packages/shared/src/index.ts";
import { buildBackgroundSchedule } from "./background-schedule.ts";
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

export interface BackgroundWorkerHandle {
  readonly stop: Effect.Effect<void>;
}

export interface BackgroundWorkerServiceShape {
  readonly start: () => Effect.Effect<BackgroundWorkerHandle, unknown>;
}

export class BackgroundWorkerService
  extends Context.Tag("@bakarr/api/BackgroundWorkerService")<
    BackgroundWorkerService,
    BackgroundWorkerServiceShape
  >() {}

const makeBackgroundWorkerService = Effect.gen(function* () {
  const system = yield* SystemService;
  const eventBus = yield* EventBus;
  const downloadService = yield* DownloadService;
  const libraryService = yield* LibraryService;
  const rssService = yield* RssService;

  const start = Effect.fn("BackgroundWorkerService.start")(function* () {
      const config = (yield* system.getConfig()) as Config;
      const schedule = buildBackgroundSchedule(config);

      const rssLoop = yield* withLockEffect(
        "rss",
        Effect.gen(function* () {
          yield* rssService.runRssCheck();
          yield* downloadService.triggerSearchMissing();
        }),
      );

      const libraryLoop = yield* withLockEffect(
        "library_scan",
        libraryService.runLibraryScan(),
      );

      const downloadSyncLoop = yield* withLockEffect(
        "download_sync",
        Effect.gen(function* () {
          const downloads: DownloadStatus[] = yield* downloadService
            .getDownloadProgress();
          yield* eventBus.publish({ type: "DownloadProgress", payload: { downloads } });
        }),
      );

      const spawnedFibers: Fiber.Fiber<void, never>[] = [
        yield* Effect.forkDaemon(
          repeatWorker(downloadSyncLoop, {
            intervalMs: schedule.downloadSyncMs,
          }),
        ),
      ];

      if (schedule.rssCronExpression !== null || schedule.rssCheckMs !== null) {
        spawnedFibers.push(
          yield* Effect.forkDaemon(
            repeatWorker(rssLoop, {
              cronExpression: schedule.rssCronExpression,
              initialDelayMs: schedule.initialDelayMs,
              intervalMs: schedule.rssCheckMs ?? undefined,
            }),
          ),
        );
      }

      if (schedule.libraryScanMs !== null) {
        spawnedFibers.push(
          yield* Effect.forkDaemon(
            repeatWorker(libraryLoop, {
              initialDelayMs: schedule.initialDelayMs,
              intervalMs: schedule.libraryScanMs,
            }),
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

function withLockEffect<A, E, R>(
  workerName: string,
  task: Effect.Effect<A, E, R>,
): Effect.Effect<Effect.Effect<void, never, R>> {
  return Effect.gen(function* () {
    const semaphore = yield* Effect.makeSemaphore(1);

    return yield* Effect.succeed(
      Effect.gen(function* () {
        const acquired = yield* semaphore.take(1).pipe(
          Effect.as(true),
          Effect.timeout("1 millis"),
          Effect.catchTag("TimeoutException", () => Effect.succeed(false)),
        );

        if (!acquired) {
          return;
        }

        const startedAt = performance.now();

        yield* task.pipe(
          Effect.catchAll((error) =>
            Effect.logError("background worker failed").pipe(
              Effect.annotateLogs(
                compactLogAnnotations({
                  component: "background",
                  durationMs: durationMsSince(startedAt),
                  event: "background.worker.failed",
                  workerName,
                  ...errorLogAnnotations(error),
                }),
              ),
            )
          ),
          Effect.ensuring(semaphore.release(1)),
        );
      }).pipe(Effect.withSpan(`background.${workerName}`)),
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
