import { Context, Effect, Layer } from "effect";

import type {
  ActivityItem,
  BackgroundJobStatus,
  LibraryStats,
  SystemStatus,
} from "@packages/shared/index.ts";
import { AppConfig } from "@/config.ts";
import { AppRuntime } from "@/app-runtime.ts";
import { Database, DatabaseError } from "@/db/database.ts";
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
  countMonitoredAnimeRows,
  countQueuedDownloads,
  countRssFeedRows,
  countUpToDateAnimeRows,
  listRecentSystemLogRows,
} from "@/features/system/repository/stats-repository.ts";
import { SystemConfigService } from "@/features/system/system-config-service.ts";
import { findBackgroundJobStatus } from "@/features/system/background-status.ts";

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

const makeSystemStatusService = Effect.gen(function* () {
  const { db } = yield* Database;
  const appConfig = yield* AppConfig;
  const runtime = yield* AppRuntime;
  const clock = yield* ClockService;
  const diskSpaceInspector = yield* DiskSpaceInspector;
  const configService = yield* SystemConfigService;
  const backgroundJobStatusService = yield* BackgroundJobStatusService;
  const currentTimeMillis = () => clock.currentTimeMillis;

  const getSystemStatus = Effect.fn("SystemStatusService.getSystemStatus")(function* () {
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
      last_metadata_refresh:
        metadataRefreshJob?.last_success_at ?? metadataRefreshJob?.last_run_at ?? null,
      pending_downloads: queuedDownloads,
      uptime: Math.max(0, Math.floor((now - runtime.startedAt.getTime()) / 1000)),
      version: appConfig.appVersion,
    } satisfies SystemStatus;
  });

  const getLibraryStats = Effect.fn("SystemStatusService.getLibraryStats")(function* () {
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
        totalEpisodes > 0
          ? Math.min(100, Math.round((downloadedEpisodes / totalEpisodes) * 100))
          : 0,
      missing_episodes: Math.max(totalEpisodes - downloadedEpisodes, 0),
      monitored_anime: monitoredAnime,
      recent_downloads: completedDownloads,
      rss_feeds: totalRssFeeds,
      total_anime: totalAnime,
      total_episodes: totalEpisodes,
      up_to_date_anime: upToDateAnime,
    };
  });

  const getActivity = Effect.fn("SystemStatusService.getActivity")(function* () {
    const rows = yield* listRecentSystemLogRows(db, 20);

    return rows.map((row) => ({
      activity_type: row.eventType,
      anime_id: 0,
      anime_title: "Bakarr",
      description: row.message,
      id: row.id,
      timestamp: row.createdAt,
    }));
  });

  const getJobs = Effect.fn("SystemStatusService.getJobs")(function* () {
    return yield* backgroundJobStatusService
      .getSnapshot()
      .pipe(Effect.map((snapshot) => snapshot.jobs));
  });

  return {
    getSystemStatus,
    getLibraryStats,
    getActivity,
    getJobs,
  } satisfies SystemStatusServiceShape;
});

export const SystemStatusServiceLive = Layer.effect(SystemStatusService, makeSystemStatusService);
