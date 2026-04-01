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
import { Database } from "@/db/database.ts";
import type { DatabaseError } from "@/db/database.ts";
import { ClockService } from "@/lib/clock.ts";
import {
  DiskSpaceError,
  DiskSpaceInspector,
  selectStoragePath,
} from "@/features/system/disk-space.ts";
import {
  BackgroundJobStatusError,
  BackgroundJobStatusService,
} from "@/features/system/background-job-status-service.ts";
import {
  countActiveDownloads,
  countAnimeRows,
  countCompletedDownloads,
  countDownloadedEpisodeRows,
  countEpisodeRows,
  countFailedDownloads,
  countImportedDownloads,
  countMonitoredAnimeRows,
  countQueuedDownloads,
  countRssFeedRows,
  countUpToDateAnimeRows,
  listRecentDownloadEventRows,
  listRecentSystemLogRows,
} from "@/features/system/repository/stats-repository.ts";
import { SystemConfigService } from "@/features/system/system-config-service.ts";
import {
  countRunningBackgroundJobStatuses,
  findBackgroundJobStatus,
} from "@/features/system/background-status.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "@/lib/download-event-presentations.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";

export type SystemSummaryServiceError =
  | BackgroundJobStatusError
  | DatabaseError
  | DiskSpaceError
  | OperationsStoredDataError;

export interface SystemSummaryServiceShape {
  readonly getSystemStatusSummary: () => Effect.Effect<SystemStatus, BackgroundJobStatusError | DiskSpaceError>;
  readonly getLibraryStatsSummary: () => Effect.Effect<LibraryStats, DatabaseError>;
  readonly getActivitySummary: () => Effect.Effect<ActivityItem[], DatabaseError>;
  readonly getJobsSummary: () => Effect.Effect<BackgroundJobStatus[], BackgroundJobStatusError>;
  readonly getDashboardSummary: () => Effect.Effect<
    OpsDashboard,
    BackgroundJobStatusError | OperationsStoredDataError
  >;
  readonly getRuntimeMetricsSummary: () => Effect.Effect<
    {
      readonly active_download_items: number;
      readonly active_torrents: number;
      readonly downloaded_episodes: number;
      readonly missing_episodes: number;
      readonly pending_downloads: number;
      readonly total_anime: number;
      readonly total_episodes: number;
    },
    BackgroundJobStatusError | DatabaseError | DiskSpaceError
  >;
}

export class SystemSummaryService extends Context.Tag("@bakarr/api/SystemSummaryService")<
  SystemSummaryService,
  SystemSummaryServiceShape
>() {}

const makeSystemSummaryService = Effect.gen(function* () {
  const { db } = yield* Database;
  const appConfig = yield* AppConfig;
  const runtime = yield* AppRuntime;
  const clock = yield* ClockService;
  const diskSpaceInspector = yield* DiskSpaceInspector;
  const configService = yield* SystemConfigService;
  const backgroundJobStatusService = yield* BackgroundJobStatusService;
  const currentTimeMillis = () => clock.currentTimeMillis;

  const getSystemStatusSummary = Effect.fn("SystemSummaryService.getSystemStatusSummary")(function* () {
    const currentConfig = yield* configService.getConfig();
    const storagePath = selectStoragePath(currentConfig, appConfig.databaseFile);
    const diskSpace = yield* diskSpaceInspector.getDiskSpaceSafe(storagePath);
    const queuedDownloads = yield* countQueuedDownloads(db);
    const activeDownloads = yield* countActiveDownloads(db);
    const snapshot = yield* backgroundJobStatusService.getSnapshot();
    const rssJob = findBackgroundJobStatus(snapshot.jobs, "rss");
    const scanJob = findBackgroundJobStatus(snapshot.jobs, "library_scan");
    const metadataRefreshJob = findBackgroundJobStatus(snapshot.jobs, "metadata_refresh");
    const now = yield* currentTimeMillis();

    return {
      active_torrents: activeDownloads,
      disk_space: { free: diskSpace.free, total: diskSpace.total },
      last_rss: rssJob?.last_success_at ?? rssJob?.last_run_at ?? null,
      last_scan: scanJob?.last_success_at ?? scanJob?.last_run_at ?? null,
      last_metadata_refresh: metadataRefreshJob?.last_success_at ?? metadataRefreshJob?.last_run_at ?? null,
      pending_downloads: queuedDownloads,
      uptime: Math.max(0, Math.floor((now - runtime.startedAt.getTime()) / 1000)),
      version: appConfig.appVersion,
    } satisfies SystemStatus;
  });

  const getLibraryStatsSummary = Effect.fn("SystemSummaryService.getLibraryStatsSummary")(function* () {
    const totalAnime = yield* countAnimeRows(db);
    const monitoredAnime = yield* countMonitoredAnimeRows(db);
    const totalEpisodes = yield* countEpisodeRows(db);
    const downloadedEpisodes = yield* countDownloadedEpisodeRows(db);
    const totalRssFeeds = yield* countRssFeedRows(db);
    const completedDownloads = yield* countCompletedDownloads(db);
    const upToDateAnime = yield* countUpToDateAnimeRows(db);

    return {
      downloaded_episodes: downloadedEpisodes,
      downloaded_percent:
        totalEpisodes > 0 ? Math.min(100, Math.round((downloadedEpisodes / totalEpisodes) * 100)) : 0,
      missing_episodes: Math.max(totalEpisodes - downloadedEpisodes, 0),
      monitored_anime: monitoredAnime,
      recent_downloads: completedDownloads,
      rss_feeds: totalRssFeeds,
      total_anime: totalAnime,
      total_episodes: totalEpisodes,
      up_to_date_anime: upToDateAnime,
    } satisfies LibraryStats;
  });

  const getActivitySummary = Effect.fn("SystemSummaryService.getActivitySummary")(function* () {
    const rows = yield* listRecentSystemLogRows(db, 20);

    return rows.map((row) => ({
      activity_type: row.eventType,
      anime_id: 0,
      anime_title: "Bakarr",
      description: row.message,
      id: row.id,
      timestamp: row.createdAt,
    } satisfies ActivityItem));
  });

  const getJobsSummary = Effect.fn("SystemSummaryService.getJobsSummary")(function* () {
    return yield* backgroundJobStatusService.getSnapshot().pipe(Effect.map((snapshot) => snapshot.jobs));
  });

  const getDashboardSummary = Effect.fn("SystemSummaryService.getDashboardSummary")(function* () {
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
      running_jobs: countRunningBackgroundJobStatuses(snapshot.jobs),
    } satisfies OpsDashboard;
  });

  const getRuntimeMetricsSummary = Effect.fn("SystemSummaryService.getRuntimeMetricsSummary")(
    function* () {
      const [status, stats] = yield* Effect.all([
        getSystemStatusSummary(),
        getLibraryStatsSummary(),
      ]);

      return {
        active_download_items: status.pending_downloads + status.active_torrents,
        active_torrents: status.active_torrents,
        downloaded_episodes: stats.downloaded_episodes,
        missing_episodes: stats.missing_episodes,
        pending_downloads: status.pending_downloads,
        total_anime: stats.total_anime,
        total_episodes: stats.total_episodes,
      } as const;
    },
  );

  return {
    getActivitySummary,
    getDashboardSummary,
    getJobsSummary,
    getLibraryStatsSummary,
    getRuntimeMetricsSummary,
    getSystemStatusSummary,
  } satisfies SystemSummaryServiceShape;
});

export const SystemSummaryServiceLive = Layer.effect(SystemSummaryService, makeSystemSummaryService);
