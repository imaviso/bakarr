import { Context, Effect, Layer } from "effect";

import { AppRuntime } from "@/app/runtime.ts";
import { AppConfig } from "@/config/schema.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "@/domain/download/event-presentations.ts";
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
import {
  listRecentDownloadEventRows,
  listRecentSystemLogRows,
  loadSystemDownloadStatsAggregate,
  loadSystemLibraryStatsAggregate,
} from "@/features/system/repository/stats-repository.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { ClockService } from "@/infra/clock.ts";
import type {
  ActivityItem,
  LibraryStats,
  OpsDashboard,
  SystemStatus,
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

export class SystemReadService extends Context.Tag("@bakarr/api/SystemReadService")<
  SystemReadService,
  SystemReadServiceShape
>() {}

export const SystemReadServiceLive = Layer.effect(
  SystemReadService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const appConfig = yield* AppConfig;
    const runtime = yield* AppRuntime;
    const clock = yield* ClockService;
    const diskSpaceInspector = yield* DiskSpaceInspector;
    const backgroundJobStatusService = yield* BackgroundJobStatusService;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

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

    return SystemReadService.of({
      getActivity,
      getDashboard,
      getLibraryStats,
      getSystemStatus,
    });
  }),
);
