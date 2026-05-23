import { Effect } from "effect";

import { AppRuntime } from "@/app/runtime.ts";
import { AppConfig } from "@/config/schema.ts";
import type { DatabaseError } from "@/db/database.ts";
import { toDownloadEvent } from "@/domain/download/event-presentations.ts";
import {
  type BackgroundJobStatusError,
  BackgroundJobStatusService,
} from "@/features/system/background-job-status-service.ts";
import {
  countRunningBackgroundJobStatuses,
  findBackgroundJobStatus,
} from "@/features/system/background-status.ts";
import {
  DiskSpaceError,
  DiskSpaceInspector,
  selectStoragePath,
} from "@/features/system/disk-space.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "@/features/system/errors.ts";
import { SystemStatsRepository } from "@/features/system/repository/stats-repository.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { ClockService } from "@/infra/clock.ts";
import {
  brandActivityId,
  brandMediaId,
  type ActivityItem,
  type LibraryStats,
  type OpsDashboard,
  type SystemStatus,
} from "@packages/shared/index.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";

export type SystemReadStatusError =
  | BackgroundJobStatusError
  | DatabaseError
  | DiskSpaceError
  | StoredConfigCorruptError
  | StoredConfigMissingError;

export type SystemReadDashboardError = BackgroundJobStatusError | OperationsStoredDataError;

export interface SystemReadServiceShape {
  readonly getActivity: () => Effect.Effect<ActivityItem[], DatabaseError>;
  readonly getDashboard: () => Effect.Effect<OpsDashboard, SystemReadDashboardError>;
  readonly getLibraryStats: () => Effect.Effect<LibraryStats, DatabaseError>;
  readonly getSystemStatus: () => Effect.Effect<SystemStatus, SystemReadStatusError>;
}

const makeSystemReadService = Effect.fn("SystemReadService.make")(function* () {
  const appConfig = yield* AppConfig;
  const runtime = yield* AppRuntime;
  const clock = yield* ClockService;
  const diskSpaceInspector = yield* DiskSpaceInspector;
  const backgroundJobStatusService = yield* BackgroundJobStatusService;
  const systemStatsRepository = yield* SystemStatsRepository;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

  const getActivity = Effect.fn("SystemReadService.getActivity")(function* () {
    const rows = yield* systemStatsRepository.listRecentSystemLogRows(20);

    return rows.map(
      (row) =>
        ({
          activity_type: row.eventType,
          media_id: brandMediaId(1),
          media_title: "Bakarr",
          description: row.message,
          id: brandActivityId(row.id),
          timestamp: row.createdAt,
        }) satisfies ActivityItem,
    );
  });

  const getDashboard = Effect.fn("SystemReadService.getDashboard")(function* () {
    const downloadStats = yield* systemStatsRepository.loadSystemDownloadStatsAggregate();
    const snapshot = yield* backgroundJobStatusService.getSnapshot();
    const events = yield* systemStatsRepository.listRecentDownloadEventRows(12);
    const eventContexts =
      yield* systemStatsRepository.loadDownloadEventPresentationContexts(events);
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

  const getLibraryStats = Effect.fn("SystemReadService.getLibraryStats")(function* () {
    const aggregate = yield* systemStatsRepository.loadSystemLibraryStatsAggregate();

    return {
      downloaded_units: aggregate.downloadedUnits,
      downloaded_percent:
        aggregate.totalUnits > 0
          ? Math.min(100, Math.round((aggregate.downloadedUnits / aggregate.totalUnits) * 100))
          : 0,
      missing_units: Math.max(aggregate.totalUnits - aggregate.downloadedUnits, 0),
      monitored_media: aggregate.monitoredAnime,
      recent_downloads: aggregate.completedDownloads,
      rss_feeds: aggregate.totalRssFeeds,
      total_media: aggregate.totalAnime,
      total_units: aggregate.totalUnits,
      up_to_date_media: aggregate.upToDateAnime,
    } satisfies LibraryStats;
  });

  const getSystemStatus = Effect.fn("SystemReadService.getSystemStatus")(function* () {
    const currentConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
    const anidbConfig = currentConfig.metadata?.anidb;
    const aniDbConfigured =
      typeof anidbConfig?.username === "string" &&
      anidbConfig.username.trim().length > 0 &&
      typeof anidbConfig.password === "string" &&
      anidbConfig.password.trim().length > 0;
    const storagePath = selectStoragePath(currentConfig, appConfig.databaseFile);
    const diskSpace = yield* diskSpaceInspector.getDiskSpaceSafe(storagePath);
    const downloadStats = yield* systemStatsRepository.loadSystemDownloadStatsAggregate();
    const snapshot = yield* backgroundJobStatusService.getSnapshot();
    const rssJob = findBackgroundJobStatus(snapshot.jobs, "rss");
    const scanJob = findBackgroundJobStatus(snapshot.jobs, "library_scan");
    const metadataRefreshJob = findBackgroundJobStatus(snapshot.jobs, "metadata_refresh");
    const now = yield* clock.currentTimeMillis;

    return {
      active_torrents: downloadStats.activeDownloads,
      disk_space: { free: diskSpace.free, total: diskSpace.total },
      last_metadata_refresh:
        metadataRefreshJob?.last_success_at ?? metadataRefreshJob?.last_run_at ?? null,
      last_rss: rssJob?.last_success_at ?? rssJob?.last_run_at ?? null,
      last_scan: scanJob?.last_success_at ?? scanJob?.last_run_at ?? null,
      metadata_providers: {
        anidb: {
          configured: aniDbConfigured,
          enabled: anidbConfig?.enabled ?? false,
        },
        jikan: {
          configured: true,
          enabled: true,
        },
        manami: {
          configured: true,
          enabled: true,
        },
      },
      pending_downloads: downloadStats.queuedDownloads,
      uptime: Math.max(0, Math.floor((now - runtime.startedAt.getTime()) / 1000)),
      version: appConfig.appVersion,
    } satisfies SystemStatus;
  });

  const service: SystemReadServiceShape = {
    getActivity,
    getDashboard,
    getLibraryStats,
    getSystemStatus,
  };
  return service;
});

export class SystemReadService extends Effect.Service<SystemReadService>()(
  "@bakarr/api/SystemReadService",
  {
    effect: makeSystemReadService(),
  },
) {}

export const SystemReadServiceLive = SystemReadService.Default;
