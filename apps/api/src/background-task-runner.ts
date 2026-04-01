import { Context, Effect, Layer } from "effect";

import { type BackgroundWorkerName } from "@/background-worker-model.ts";
import { withLockEffectOrFail } from "@/background-workers.ts";
import { type BackgroundWorkerJobsShape, BackgroundWorkerJobs } from "@/background-worker-jobs.ts";
import { BackgroundWorkerMonitor } from "@/background-monitor.ts";
import { ClockService } from "@/lib/clock.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { WorkerTimeoutError } from "@/background-workers.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import type { AnimeServiceError } from "@/features/anime/errors.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

type BackgroundTaskRunnerError =
  | AnimeServiceError
  | DatabaseError
  | ExternalCallError
  | OperationsError
  | RuntimeConfigSnapshotError
  | WorkerTimeoutError;

export interface BackgroundTaskRunnerShape {
  readonly runDownloadSyncWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runLibraryScanWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runMetadataRefreshWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runRssWorkerTask: () => Effect.Effect<void, BackgroundTaskRunnerError>;
  readonly runTaskByName: (
    workerName: BackgroundWorkerName,
  ) => Effect.Effect<void, BackgroundTaskRunnerError>;
}

export class BackgroundTaskRunner extends Context.Tag("@bakarr/api/BackgroundTaskRunner")<
  BackgroundTaskRunner,
  BackgroundTaskRunnerShape
>() {}

const makeBackgroundTaskRunner = Effect.fn("Background.makeBackgroundTaskRunner")(
  function* (input: {
    readonly jobs: BackgroundWorkerJobsShape;
    readonly monitor: typeof BackgroundWorkerMonitor.Service;
    readonly clock: typeof ClockService.Service;
  }) {
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

    const runDownloadSyncWorkerTask = yield* withLockEffectOrFail(
      "download_sync",
      input.jobs
        .runDownloadSyncWorkerTask()
        .pipe(Effect.provideService(RuntimeConfigSnapshotService, runtimeConfigSnapshot)),
      input.monitor,
      input.clock,
    );
    const runLibraryScanWorkerTask = yield* withLockEffectOrFail(
      "library_scan",
      input.jobs
        .runLibraryScanWorkerTask()
        .pipe(Effect.provideService(RuntimeConfigSnapshotService, runtimeConfigSnapshot)),
      input.monitor,
      input.clock,
    );
    const runMetadataRefreshWorkerTask = yield* withLockEffectOrFail(
      "metadata_refresh",
      input.jobs
        .runMetadataRefreshWorkerTask()
        .pipe(Effect.provideService(RuntimeConfigSnapshotService, runtimeConfigSnapshot)),
      input.monitor,
      input.clock,
    );
    const runRssWorkerTask = yield* withLockEffectOrFail(
      "rss",
      input.jobs
        .runRssWorkerTask()
        .pipe(Effect.provideService(RuntimeConfigSnapshotService, runtimeConfigSnapshot)),
      input.monitor,
      input.clock,
    );

    const runTaskByName = Effect.fn("BackgroundTaskRunner.runTaskByName")(function* (
      workerName: BackgroundWorkerName,
    ) {
      if (workerName === "download_sync") {
        return yield* runDownloadSyncWorkerTask;
      }

      if (workerName === "library_scan") {
        return yield* runLibraryScanWorkerTask;
      }

      if (workerName === "metadata_refresh") {
        return yield* runMetadataRefreshWorkerTask;
      }

      return yield* runRssWorkerTask;
    });

    return {
      runDownloadSyncWorkerTask: () => runDownloadSyncWorkerTask,
      runLibraryScanWorkerTask: () => runLibraryScanWorkerTask,
      runMetadataRefreshWorkerTask: () => runMetadataRefreshWorkerTask,
      runRssWorkerTask: () => runRssWorkerTask,
      runTaskByName,
    } satisfies BackgroundTaskRunnerShape;
  },
);

export const BackgroundTaskRunnerLive = Layer.effect(
  BackgroundTaskRunner,
  Effect.gen(function* () {
    const jobs = yield* BackgroundWorkerJobs;
    const monitor = yield* BackgroundWorkerMonitor;
    const clock = yield* ClockService;

    return yield* makeBackgroundTaskRunner({
      clock,
      jobs,
      monitor,
    });
  }),
);
