import { Effect } from "effect";

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
import { OperationsService } from "./features/operations/service.ts";
import { SystemService } from "./features/system/service.ts";
import { type ApiRuntime, runApi } from "./runtime.ts";

const DEFAULT_DOWNLOAD_SYNC_MS = 15_000;

export interface BackgroundWorkers {
  readonly stop: () => void;
}

export interface BackgroundSchedule {
  readonly downloadSyncMs: number;
  readonly libraryScanMs: number | null;
  readonly rssCheckMs: number | null;
}

export function buildBackgroundSchedule(config: Config): BackgroundSchedule {
  return {
    downloadSyncMs: DEFAULT_DOWNLOAD_SYNC_MS,
    libraryScanMs: config.library.auto_scan_interval_hours > 0
      ? config.library.auto_scan_interval_hours * 60 * 60 * 1000
      : null,
    rssCheckMs:
      config.scheduler.enabled && config.scheduler.check_interval_minutes > 0
        ? config.scheduler.check_interval_minutes * 60 * 1000
        : null,
  };
}

export async function startBackgroundWorkers(
  runtime: ApiRuntime,
): Promise<BackgroundWorkers> {
  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => runApi(runtime, effect);
  const config = await run(
    Effect.flatMap(SystemService, (service) => service.getConfig()),
  ) as Config;
  const schedule = buildBackgroundSchedule(config);
  const timers = new Set<number>();

  const rssLoop = withLock(runtime, "rss", () =>
    run(
      Effect.gen(function* () {
        yield* Effect.flatMap(OperationsService, (service) =>
          service.runRssCheck());
        yield* Effect.flatMap(OperationsService, (service) =>
          service.triggerSearchMissing());
      }),
    )
  );

  const libraryLoop = withLock(runtime, "library_scan", () =>
    run(Effect.flatMap(OperationsService, (service) => service.runLibraryScan()))
  );

  const downloadSyncLoop = withLock(runtime, "download_sync", async () => {
    const downloads = await run(
      Effect.flatMap(
        OperationsService,
        (service) => service.getDownloadProgress(),
      ),
    ) as DownloadStatus[];

    await run(
      Effect.flatMap(
        EventBus,
        (bus) =>
          bus.publish({ type: "DownloadProgress", payload: { downloads } }),
      ),
    );
  });

  await downloadSyncLoop();

  timers.add(setInterval(() => {
    void downloadSyncLoop();
  }, schedule.downloadSyncMs));

  if (schedule.rssCheckMs !== null) {
    timers.add(setInterval(() => {
      void rssLoop();
    }, schedule.rssCheckMs));
  }

  if (schedule.libraryScanMs !== null) {
    timers.add(setInterval(() => {
      void libraryLoop();
    }, schedule.libraryScanMs));
  }

  return {
    stop: () => {
      for (const timer of timers) {
        clearInterval(timer);
      }

      timers.clear();
    },
  };
}

function withLock<T>(
  runtime: ApiRuntime,
  workerName: string,
  task: () => Promise<T>,
) {
  let running = false;

  return async () => {
    if (running) {
      return;
    }

    running = true;
    const startedAt = performance.now();

    try {
      await task();
    } catch (error) {
      await runApi(
        runtime,
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
        ),
      ).catch(() => undefined);
    } finally {
      running = false;
    }
  };
}
