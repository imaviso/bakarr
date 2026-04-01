import { Context, Effect, Layer } from "effect";

import type {
  ActivityItem,
  BackgroundJobStatus,
  LibraryStats,
  SystemStatus,
} from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { DiskSpaceError } from "@/features/system/disk-space.ts";
import {
  BackgroundJobStatusError,
} from "@/features/system/background-job-status-service.ts";
import {
  SystemSummaryService,
} from "@/features/system/system-summary-service.ts";

export interface SystemStatusServiceShape {
  readonly getSystemStatus: () => Effect.Effect<
    SystemStatus,
    BackgroundJobStatusError | DiskSpaceError
  >;
  readonly getLibraryStats: () => Effect.Effect<LibraryStats, DatabaseError>;
  readonly getActivity: () => Effect.Effect<ActivityItem[], DatabaseError>;
  readonly getJobs: () => Effect.Effect<BackgroundJobStatus[], BackgroundJobStatusError>;
}

export class SystemStatusService extends Context.Tag("@bakarr/api/SystemStatusService")<
  SystemStatusService,
  SystemStatusServiceShape
>() {}

export const SystemStatusServiceLive = Layer.effect(
  SystemStatusService,
  Effect.gen(function* () {
    const summaryService = yield* SystemSummaryService;

    const getSystemStatus = Effect.fn("SystemStatusService.getSystemStatus")(function* () {
      return yield* summaryService.getSystemStatusSummary();
    });

    const getLibraryStats = Effect.fn("SystemStatusService.getLibraryStats")(function* () {
      return yield* summaryService.getLibraryStatsSummary();
    });

    const getActivity = Effect.fn("SystemStatusService.getActivity")(function* () {
      return yield* summaryService.getActivitySummary();
    });

    const getJobs = Effect.fn("SystemStatusService.getJobs")(function* () {
      return yield* summaryService.getJobsSummary();
    });

    return {
      getActivity,
      getJobs,
      getLibraryStats,
      getSystemStatus,
    } satisfies SystemStatusServiceShape;
  }),
);
