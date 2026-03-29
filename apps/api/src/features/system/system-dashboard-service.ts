import { Context, Effect, Layer } from "effect";

import type { OpsDashboard } from "@packages/shared/index.ts";
import { Database } from "@/db/database.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "@/lib/download-event-presentations.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import {
  BackgroundJobStatusError,
  BackgroundJobStatusService,
} from "@/features/system/background-job-status-service.ts";
import {
  countActiveDownloads,
  countFailedDownloads,
  countImportedDownloads,
  countQueuedDownloads,
  listRecentDownloadEventRows,
} from "@/features/system/repository/stats-repository.ts";

export interface SystemDashboardServiceShape {
  readonly getDashboard: () => Effect.Effect<
    OpsDashboard,
    BackgroundJobStatusError | OperationsStoredDataError
  >;
}

export class SystemDashboardService extends Context.Tag("@bakarr/api/SystemDashboardService")<
  SystemDashboardService,
  SystemDashboardServiceShape
>() {}

const makeSystemDashboardService = Effect.gen(function* () {
  const { db } = yield* Database;
  const backgroundJobStatusService = yield* BackgroundJobStatusService;

  const getDashboard = Effect.fn("SystemDashboardService.getDashboard")(function* () {
    const queuedDownloads = yield* countQueuedDownloads(db);
    const activeDownloads = yield* countActiveDownloads(db);
    const failedDownloads = yield* countFailedDownloads(db);
    const importedDownloads = yield* countImportedDownloads(db);
    const snapshot = yield* backgroundJobStatusService.getSnapshot();
    const events = yield* listRecentDownloadEventRows(db, 12);
    const eventContexts = yield* loadDownloadEventPresentationContexts(db, events);

    const recentDownloadEvents = yield* Effect.forEach(events, (row) =>
      toDownloadEvent(row, eventContexts.get(row.id)),
    );

    return {
      active_downloads: activeDownloads,
      failed_downloads: failedDownloads,
      imported_downloads: importedDownloads,
      jobs: snapshot.jobs,
      queued_downloads: queuedDownloads,
      recent_download_events: recentDownloadEvents,
      running_jobs: snapshot.runningJobs,
    } as OpsDashboard;
  });

  return { getDashboard } satisfies SystemDashboardServiceShape;
});

export const SystemDashboardServiceLive = Layer.effect(
  SystemDashboardService,
  makeSystemDashboardService,
);
