import { Context, Effect, Layer } from "effect";

import type {
  ActivityItem,
  BackgroundJobStatus,
  LibraryStats,
  OpsDashboard,
  SystemStatus,
} from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import {
  BackgroundJobStatusError,
  BackgroundJobStatusService,
} from "@/features/system/background-job-status-service.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "@/features/system/errors.ts";
import {
  type RuntimeMetricsSummary,
  type SystemRuntimeMetricsError,
  SystemRuntimeMetricsService,
} from "@/features/system/system-runtime-metrics-service.ts";
import {
  type SystemStatusReadError,
  SystemStatusReadService,
} from "@/features/system/system-status-read-service.ts";
import { SystemLibraryStatsReadService } from "@/features/system/system-library-stats-read-service.ts";
import { SystemActivityReadService } from "@/features/system/system-activity-read-service.ts";
import {
  type SystemDashboardReadError,
  SystemDashboardReadService,
} from "@/features/system/system-dashboard-read-service.ts";

export type SystemReadServiceError =
  | SystemStatusReadError
  | SystemDashboardReadError
  | DatabaseError
  | StoredConfigCorruptError
  | StoredConfigMissingError
  | OperationsStoredDataError;

export interface SystemReadServiceShape {
  readonly getSystemStatus: () => Effect.Effect<SystemStatus, SystemStatusReadError>;
  readonly getLibraryStats: () => Effect.Effect<LibraryStats, DatabaseError>;
  readonly getActivity: () => Effect.Effect<ActivityItem[], DatabaseError>;
  readonly getJobs: () => Effect.Effect<BackgroundJobStatus[], BackgroundJobStatusError>;
  readonly getDashboard: () => Effect.Effect<
    OpsDashboard,
    BackgroundJobStatusError | OperationsStoredDataError
  >;
  readonly getRuntimeMetricsSummary: () => Effect.Effect<
    RuntimeMetricsSummary,
    SystemRuntimeMetricsError
  >;
}

export class SystemReadService extends Context.Tag("@bakarr/api/SystemReadService")<
  SystemReadService,
  SystemReadServiceShape
>() {}

const makeSystemReadService = Effect.gen(function* () {
  const systemStatusReadService = yield* SystemStatusReadService;
  const systemLibraryStatsReadService = yield* SystemLibraryStatsReadService;
  const systemActivityReadService = yield* SystemActivityReadService;
  const systemDashboardReadService = yield* SystemDashboardReadService;
  const systemRuntimeMetricsService = yield* SystemRuntimeMetricsService;
  const backgroundJobStatusService = yield* BackgroundJobStatusService;

  const getSystemStatus = Effect.fn("SystemReadService.getSystemStatus")(() =>
    systemStatusReadService.getSystemStatus(),
  );

  const getLibraryStats = Effect.fn("SystemReadService.getLibraryStats")(() =>
    systemLibraryStatsReadService.getLibraryStats(),
  );

  const getActivity = Effect.fn("SystemReadService.getActivity")(() =>
    systemActivityReadService.getActivity(),
  );

  const getJobs = Effect.fn("SystemReadService.getJobs")(function* () {
    return yield* backgroundJobStatusService
      .getSnapshot()
      .pipe(Effect.map((snapshot) => snapshot.jobs));
  });

  const getDashboard = Effect.fn("SystemReadService.getDashboard")(() =>
    systemDashboardReadService.getDashboard(),
  );

  const getRuntimeMetricsSummary = Effect.fn("SystemReadService.getRuntimeMetricsSummary")(() =>
    systemRuntimeMetricsService.getRuntimeMetricsSummary(),
  );

  return {
    getActivity,
    getDashboard,
    getJobs,
    getLibraryStats,
    getRuntimeMetricsSummary,
    getSystemStatus,
  } satisfies SystemReadServiceShape;
});

export const SystemReadServiceLive = Layer.effect(SystemReadService, makeSystemReadService);
