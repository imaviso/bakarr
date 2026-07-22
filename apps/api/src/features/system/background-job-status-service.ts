import { Effect } from "effect";

import type { BackgroundJobStatus } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { BackgroundWorkerMonitor } from "@/background/monitor.ts";
import { composeBackgroundJobStatuses } from "@/features/system/background-status.ts";
import { ConfigValidationError } from "@/features/system/errors.ts";
import { SystemStatsRepository } from "@/features/system/repository/stats-repository.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export type BackgroundJobStatusError =
  | DatabaseError
  | ConfigValidationError
  | RuntimeConfigSnapshotError;

export interface BackgroundJobStatusSnapshot {
  readonly jobs: BackgroundJobStatus[];
  readonly runningJobs: number;
}

export interface BackgroundJobStatusServiceShape {
  readonly getSnapshot: () => Effect.Effect<BackgroundJobStatusSnapshot, BackgroundJobStatusError>;
}

const makeBackgroundJobStatusService = Effect.fn("BackgroundJobStatusService.make")(function* () {
  const monitor = yield* BackgroundWorkerMonitor;
  const systemStatsRepository = yield* SystemStatsRepository;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

  const getSnapshot = Effect.fn("BackgroundJobStatusService.getSnapshot")(function* () {
    const currentConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
    const jobRows = yield* systemStatsRepository.listBackgroundJobRows();
    const liveSnapshot = yield* monitor.snapshot();
    const jobs = composeBackgroundJobStatuses(currentConfig, liveSnapshot, jobRows);

    return {
      jobs,
      runningJobs: jobs.filter((job) => job.is_running).length,
    } satisfies BackgroundJobStatusSnapshot;
  });

  return {
    getSnapshot,
  } satisfies BackgroundJobStatusServiceShape;
});

export class BackgroundJobStatusService extends Effect.Service<BackgroundJobStatusService>()(
  "@bakarr/api/BackgroundJobStatusService",
  {
    effect: makeBackgroundJobStatusService(),
    dependencies: [SystemStatsRepository.Default],
  },
) {}

export const BackgroundJobStatusServiceLive = BackgroundJobStatusService.Default;
