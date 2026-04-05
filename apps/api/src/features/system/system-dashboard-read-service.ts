import { Context, Effect, Layer } from "effect";

import type { OpsDashboard } from "@packages/shared/index.ts";
import { Database } from "@/db/database.ts";
import {
  type BackgroundJobStatusError,
  BackgroundJobStatusService,
} from "@/features/system/background-job-status-service.ts";
import { countRunningBackgroundJobStatuses } from "@/features/system/background-status.ts";
import {
  listRecentDownloadEventRows,
  loadSystemDownloadStatsAggregate,
} from "@/features/system/repository/stats-repository.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "@/lib/download-event-presentations.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";

export type SystemDashboardReadError = BackgroundJobStatusError | OperationsStoredDataError;

export interface SystemDashboardReadServiceShape {
  readonly getDashboard: () => Effect.Effect<OpsDashboard, SystemDashboardReadError>;
}

export class SystemDashboardReadService extends Context.Tag(
  "@bakarr/api/SystemDashboardReadService",
)<SystemDashboardReadService, SystemDashboardReadServiceShape>() {}

export const SystemDashboardReadServiceLive = Layer.effect(
  SystemDashboardReadService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const backgroundJobStatusService = yield* BackgroundJobStatusService;

    const getDashboard = Effect.fn("SystemDashboardReadService.getDashboard")(function* () {
      const downloadStats = yield* loadSystemDownloadStatsAggregate(db);
      const snapshot = yield* backgroundJobStatusService.getSnapshot();
      const events = yield* listRecentDownloadEventRows(db, 12);
      const eventContexts = yield* loadDownloadEventPresentationContexts(db, events);
      const recentDownloadEvents = yield* Effect.forEach(events, (row) =>
        toDownloadEvent(row, eventContexts.get(row.id)),
      );

      return {
        active_downloads: downloadStats.activeDownloads,
        failed_downloads: downloadStats.failedDownloads,
        imported_downloads: downloadStats.importedDownloads,
        jobs: snapshot.jobs,
        queued_downloads: downloadStats.queuedDownloads,
        recent_download_events: recentDownloadEvents,
        running_jobs: countRunningBackgroundJobStatuses(snapshot.jobs),
      } satisfies OpsDashboard;
    });

    return SystemDashboardReadService.of({ getDashboard });
  }),
);
