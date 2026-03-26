import { CommandExecutor } from "@effect/platform";
import { Context, Effect, Layer, Option } from "effect";

import type {
  ActivityItem,
  BackgroundJobStatus,
  LibraryStats,
  SystemStatus,
} from "../../../../../packages/shared/src/index.ts";
import { AppConfig } from "../../config.ts";
import { AppRuntime } from "../../app-runtime.ts";
import { BackgroundWorkerMonitor } from "../../background-monitor.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { ClockService } from "../../lib/clock.ts";
import { AnimeStoredDataError } from "../anime/errors.ts";
import { toAnimeDto } from "../anime/dto.ts";
import { composeBackgroundJobStatuses, findBackgroundJobStatus } from "./background-status.ts";
import { effectDecodeConfigCore } from "./config-codec.ts";
import { makeDefaultConfig } from "./defaults.ts";
import { DiskSpaceError, makeDiskSpaceInspector, selectStoragePath } from "./disk-space.ts";
import { ConfigValidationError, StoredConfigCorruptError } from "./errors.ts";
import {
  countActiveDownloads,
  countAnimeRows,
  countCompletedDownloads,
  countDownloadedEpisodeRows,
  countEpisodeRows,
  countMonitoredAnimeRows,
  countQueuedDownloads,
  countRssFeedRows,
  listBackgroundJobRows,
  listRecentSystemLogRows,
  loadSystemConfigRow,
} from "./repository.ts";
import { composeConfig } from "./config-codec.ts";
import { SystemConfigService } from "./system-config-service.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { anime, episodes } from "../../db/schema.ts";

export interface SystemStatusServiceShape {
  readonly getSystemStatus: () => Effect.Effect<
    SystemStatus,
    DatabaseError | StoredConfigCorruptError | DiskSpaceError
  >;
  readonly getLibraryStats: () => Effect.Effect<LibraryStats, DatabaseError | AnimeStoredDataError>;
  readonly getActivity: () => Effect.Effect<ActivityItem[], DatabaseError>;
  readonly getJobs: () => Effect.Effect<
    BackgroundJobStatus[],
    DatabaseError | ConfigValidationError | StoredConfigCorruptError
  >;
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
  const monitor = yield* BackgroundWorkerMonitor;
  const commandExecutor = yield* Effect.serviceOption(CommandExecutor.CommandExecutor);
  const diskSpaceInspector = makeDiskSpaceInspector(Option.getOrUndefined(commandExecutor));
  const configService = yield* SystemConfigService;
  const currentTimeMillis = () => clock.currentTimeMillis;

  const getSystemStatus = Effect.fn("SystemStatusService.getSystemStatus")(function* () {
    const storedConfig = yield* loadSystemConfigRow(db);

    const core = storedConfig
      ? yield* effectDecodeConfigCore(storedConfig.data)
      : makeDefaultConfig(appConfig.databaseFile);

    const statusConfig = composeConfig(core, []);
    const storagePath = selectStoragePath(statusConfig, appConfig.databaseFile);
    const diskSpace = yield* diskSpaceInspector.getDiskSpaceSafe(storagePath);
    const queuedDownloads = yield* countQueuedDownloads(db);
    const activeDownloads = yield* countActiveDownloads(db);
    const jobRows = yield* listBackgroundJobRows(db);
    const liveSnapshot = yield* monitor.snapshot();
    const jobs = composeBackgroundJobStatuses(statusConfig, liveSnapshot, jobRows);
    const rssJob = findBackgroundJobStatus(jobs, "rss");
    const scanJob = findBackgroundJobStatus(jobs, "library_scan");
    const metadataRefreshJob = findBackgroundJobStatus(jobs, "metadata_refresh");
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
    const animeRows = yield* tryDatabasePromise("Failed to load library stats", () =>
      db.select().from(anime),
    );
    const episodeRows = yield* tryDatabasePromise("Failed to load library stats", () =>
      db.select().from(episodes),
    );
    const episodesByAnimeId = new Map<number, Array<typeof episodes.$inferSelect>>();

    for (const episodeRow of episodeRows) {
      const bucket = episodesByAnimeId.get(episodeRow.animeId);

      if (bucket) {
        bucket.push(episodeRow);
      } else {
        episodesByAnimeId.set(episodeRow.animeId, [episodeRow]);
      }
    }

    const animeDtos = yield* Effect.forEach(animeRows, (animeRow) =>
      toAnimeDto(animeRow, episodesByAnimeId.get(animeRow.id) ?? []),
    );
    const upToDateAnime = animeDtos.filter(
      (animeDto) => animeDto.monitored && animeDto.progress.is_up_to_date,
    ).length;

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
    const currentConfig = yield* configService.getConfig();
    const jobRows = yield* listBackgroundJobRows(db);
    const liveSnapshot = yield* monitor.snapshot();
    return composeBackgroundJobStatuses(currentConfig, liveSnapshot, jobRows);
  });

  return {
    getSystemStatus,
    getLibraryStats,
    getActivity,
    getJobs,
  } satisfies SystemStatusServiceShape;
});

export const SystemStatusServiceLive = Layer.effect(SystemStatusService, makeSystemStatusService);
