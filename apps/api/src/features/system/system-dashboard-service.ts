import { Context, Effect, Layer } from "effect";

import type { OpsDashboard } from "../../../../../packages/shared/src/index.ts";
import { BackgroundWorkerMonitor } from "../../background.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "../operations/repository.ts";
import { OperationsStoredDataError } from "../operations/errors.ts";
import {
  composeBackgroundJobStatuses,
  countRunningBackgroundJobStatuses,
} from "./background-status.ts";
import { ConfigValidationError, StoredConfigCorruptError } from "./errors.ts";
import {
  countActiveDownloads,
  countFailedDownloads,
  countImportedDownloads,
  countQueuedDownloads,
  listBackgroundJobRows,
  listRecentDownloadEventRows,
} from "./repository.ts";
import { SystemConfigService } from "./system-config-service.ts";

export interface SystemDashboardServiceShape {
  readonly getDashboard: () => Effect.Effect<
    OpsDashboard,
    DatabaseError | ConfigValidationError | StoredConfigCorruptError | OperationsStoredDataError
  >;
}

export class SystemDashboardService extends Context.Tag("@bakarr/api/SystemDashboardService")<
  SystemDashboardService,
  SystemDashboardServiceShape
>() {}

const makeSystemDashboardService = Effect.gen(function* () {
  const { db } = yield* Database;
  const monitor = yield* BackgroundWorkerMonitor;
  const configService = yield* SystemConfigService;

  const getDashboard = Effect.fn("SystemDashboardService.getDashboard")(function* () {
    const currentConfig = yield* configService.getConfig();
    const queuedDownloads = yield* countQueuedDownloads(db);
    const activeDownloads = yield* countActiveDownloads(db);
    const failedDownloads = yield* countFailedDownloads(db);
    const importedDownloads = yield* countImportedDownloads(db);
    const jobRows = yield* listBackgroundJobRows(db);
    const liveSnapshot = yield* monitor.snapshot();
    const jobs = composeBackgroundJobStatuses(currentConfig, liveSnapshot, jobRows);
    const events = yield* listRecentDownloadEventRows(db, 12);
    const eventContexts = yield* loadDownloadEventPresentationContexts(db, events);

    const recentDownloadEvents = yield* Effect.forEach(events, (row) =>
      toDownloadEvent(row, eventContexts.get(row.id)),
    );

    return {
      active_downloads: activeDownloads,
      failed_downloads: failedDownloads,
      imported_downloads: importedDownloads,
      jobs,
      queued_downloads: queuedDownloads,
      recent_download_events: recentDownloadEvents,
      running_jobs: countRunningBackgroundJobStatuses(jobs),
    } as OpsDashboard;
  });

  return { getDashboard } satisfies SystemDashboardServiceShape;
});

export const SystemDashboardServiceLive = Layer.effect(
  SystemDashboardService,
  makeSystemDashboardService,
);
