import { Context, Effect, Layer } from "effect";

import type {
  ActivityItem,
  BackgroundJobStatus,
  LibraryStats,
  OpsDashboard,
  SystemStatus,
} from "@packages/shared/index.ts";
import { AppConfig } from "@/config.ts";
import { AppRuntime } from "@/app-runtime.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import {
  BackgroundJobStatusError,
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
import {
  loadSystemDownloadStatsAggregate,
  loadSystemLibraryStatsAggregate,
  listRecentDownloadEventRows,
  listRecentSystemLogRows,
} from "@/features/system/repository/stats-repository.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { ClockService } from "@/lib/clock.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "@/lib/download-event-presentations.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "@/features/system/errors.ts";

export type SystemReadServiceError =
  | BackgroundJobStatusError
  | DatabaseError
  | DiskSpaceError
  | StoredConfigCorruptError
  | StoredConfigMissingError
  | OperationsStoredDataError;

export interface RuntimeMetricsSummary {
  readonly active_download_items: number;
  readonly active_torrents: number;
  readonly downloaded_episodes: number;
  readonly missing_episodes: number;
  readonly pending_downloads: number;
  readonly total_anime: number;
  readonly total_episodes: number;
}

export interface SystemReadServiceShape {
  readonly getSystemStatus: () => Effect.Effect<
    SystemStatus,
    BackgroundJobStatusError | DiskSpaceError | StoredConfigCorruptError | StoredConfigMissingError
  >;
  readonly getLibraryStats: () => Effect.Effect<LibraryStats, DatabaseError>;
  readonly getActivity: () => Effect.Effect<ActivityItem[], DatabaseError>;
  readonly getJobs: () => Effect.Effect<BackgroundJobStatus[], BackgroundJobStatusError>;
  readonly getDashboard: () => Effect.Effect<
    OpsDashboard,
    BackgroundJobStatusError | OperationsStoredDataError
  >;
  readonly getRuntimeMetricsSummary: () => Effect.Effect<
    RuntimeMetricsSummary,
    | BackgroundJobStatusError
    | DatabaseError
    | DiskSpaceError
    | StoredConfigCorruptError
    | StoredConfigMissingError
  >;
}

export class SystemReadService extends Context.Tag("@bakarr/api/SystemReadService")<
  SystemReadService,
  SystemReadServiceShape
>() {}

const makeSystemReadService = Effect.gen(function* () {
  const { db } = yield* Database;
  const appConfig = yield* AppConfig;
  const runtime = yield* AppRuntime;
  const clock = yield* ClockService;
  const diskSpaceInspector = yield* DiskSpaceInspector;
  const backgroundJobStatusService = yield* BackgroundJobStatusService;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

  const getSystemStatus = Effect.fn("SystemReadService.getSystemStatus")(function* () {
    const currentConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
    const storagePath = selectStoragePath(currentConfig, appConfig.databaseFile);
    const diskSpace = yield* diskSpaceInspector.getDiskSpaceSafe(storagePath);
    const downloadStats = yield* loadSystemDownloadStatsAggregate(db);
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
      pending_downloads: downloadStats.queuedDownloads,
      uptime: Math.max(0, Math.floor((now - runtime.startedAt.getTime()) / 1000)),
      version: appConfig.appVersion,
    } satisfies SystemStatus;
  });

  const getLibraryStats = Effect.fn("SystemReadService.getLibraryStats")(function* () {
    const aggregate = yield* loadSystemLibraryStatsAggregate(db);

    return {
      downloaded_episodes: aggregate.downloadedEpisodes,
      downloaded_percent:
        aggregate.totalEpisodes > 0
          ? Math.min(
              100,
              Math.round((aggregate.downloadedEpisodes / aggregate.totalEpisodes) * 100),
            )
          : 0,
      missing_episodes: Math.max(aggregate.totalEpisodes - aggregate.downloadedEpisodes, 0),
      monitored_anime: aggregate.monitoredAnime,
      recent_downloads: aggregate.completedDownloads,
      rss_feeds: aggregate.totalRssFeeds,
      total_anime: aggregate.totalAnime,
      total_episodes: aggregate.totalEpisodes,
      up_to_date_anime: aggregate.upToDateAnime,
    } satisfies LibraryStats;
  });

  const getActivity = Effect.fn("SystemReadService.getActivity")(function* () {
    const rows = yield* listRecentSystemLogRows(db, 20);

    return rows.map(
      (row) =>
        ({
          activity_type: row.eventType,
          anime_id: 0,
          anime_title: "Bakarr",
          description: row.message,
          id: row.id,
          timestamp: row.createdAt,
        }) satisfies ActivityItem,
    );
  });

  const getJobs = Effect.fn("SystemReadService.getJobs")(function* () {
    return yield* backgroundJobStatusService
      .getSnapshot()
      .pipe(Effect.map((snapshot) => snapshot.jobs));
  });

  const getDashboard = Effect.fn("SystemReadService.getDashboard")(function* () {
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

  const getRuntimeMetricsSummary = Effect.fn("SystemReadService.getRuntimeMetricsSummary")(
    function* () {
      const [status, stats] = yield* Effect.all([getSystemStatus(), getLibraryStats()]);

      return {
        active_download_items: status.pending_downloads + status.active_torrents,
        active_torrents: status.active_torrents,
        downloaded_episodes: stats.downloaded_episodes,
        missing_episodes: stats.missing_episodes,
        pending_downloads: status.pending_downloads,
        total_anime: stats.total_anime,
        total_episodes: stats.total_episodes,
      } satisfies RuntimeMetricsSummary;
    },
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
