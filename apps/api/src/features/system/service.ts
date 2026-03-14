import * as Cron from "effect/Cron";
import { Context, Effect, Either, Layer } from "effect";

import type {
  ActivityItem,
  BackgroundJobStatus,
  Config,
  LibraryStats,
  OpsDashboard,
  Quality,
  QualityProfile,
  ReleaseProfile,
  SystemLogsResponse,
  SystemStatus,
} from "../../../../../packages/shared/src/index.ts";
import { AppRuntime } from "../../app-runtime.ts";
import { AppConfig } from "../../config.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { systemLogs } from "../../db/schema.ts";
import { EventBus } from "../events/event-bus.ts";
import {
  DEFAULT_PROFILES,
  DEFAULT_QUALITIES,
  makeDefaultConfig,
} from "./defaults.ts";
import { setRuntimeLogLevel } from "../../lib/logging.ts";
import { ConfigValidationError, ProfileNotFoundError } from "./errors.ts";
import {
  type ConfigCore,
  decodeConfigCore,
  decodeQualityProfileRow,
  decodeReleaseProfileRow,
  encodeConfigCore,
  encodeQualityProfileRow,
  encodeReleaseProfileRules,
} from "./config-codec.ts";
import {
  appendSystemLog,
  backgroundJobNames,
  getDiskSpaceSafe,
  normalizeLevel,
  nowIso,
  toBackgroundJobStatus,
} from "./support.ts";
import {
  countActiveDownloads,
  countAnimeRows,
  countCompletedDownloads,
  countDownloadedEpisodeRows,
  countEpisodeRows,
  countFailedDownloads,
  countImportedDownloads,
  countQueuedDownloads,
  countQueuedOrDownloadingDownloads,
  countRssFeedRows,
  countRunningBackgroundJobs,
  deleteQualityProfileRow,
  deleteReleaseProfileRow,
  insertQualityProfileRow,
  insertQualityProfileRows,
  insertReleaseProfileRow,
  insertSystemConfigRow,
  listBackgroundJobRows,
  listQualityProfileRows,
  listRecentDownloadEventRows,
  listRecentSystemLogRows,
  listReleaseProfileRows,
  loadAnyQualityProfileRow,
  loadBackgroundJobRow,
  loadQualityProfileRow,
  loadSystemConfigRow,
  loadSystemLogPage,
  updateQualityProfileRow,
  updateReleaseProfileRow,
  updateSystemConfigAtomic,
} from "./repository.ts";

export interface SystemServiceShape {
  readonly ensureInitialized: () => Effect.Effect<void, DatabaseError>;
  readonly getSystemStatus: () => Effect.Effect<SystemStatus, DatabaseError>;
  readonly getLibraryStats: () => Effect.Effect<LibraryStats, DatabaseError>;
  readonly getActivity: () => Effect.Effect<ActivityItem[], DatabaseError>;
  readonly getJobs: () => Effect.Effect<BackgroundJobStatus[], DatabaseError>;
  readonly getDashboard: () => Effect.Effect<OpsDashboard, DatabaseError>;
  readonly getConfig: () => Effect.Effect<Config, DatabaseError>;
  readonly updateConfig: (
    config: Config,
  ) => Effect.Effect<Config, DatabaseError | ConfigValidationError>;
  readonly listProfiles: () => Effect.Effect<QualityProfile[], DatabaseError>;
  readonly listQualities: () => Effect.Effect<Quality[], never>;
  readonly createProfile: (
    profile: QualityProfile,
  ) => Effect.Effect<QualityProfile, DatabaseError>;
  readonly updateProfile: (
    name: string,
    profile: QualityProfile,
  ) => Effect.Effect<QualityProfile, DatabaseError | ProfileNotFoundError>;
  readonly deleteProfile: (name: string) => Effect.Effect<void, DatabaseError>;
  readonly listReleaseProfiles: () => Effect.Effect<
    ReleaseProfile[],
    DatabaseError
  >;
  readonly createReleaseProfile: (
    input: Omit<ReleaseProfile, "id" | "enabled"> & { enabled?: boolean },
  ) => Effect.Effect<ReleaseProfile, DatabaseError>;
  readonly updateReleaseProfile: (
    id: number,
    input: Omit<ReleaseProfile, "id">,
  ) => Effect.Effect<void, DatabaseError>;
  readonly deleteReleaseProfile: (
    id: number,
  ) => Effect.Effect<void, DatabaseError>;
  readonly getLogs: (input: {
    page: number;
    pageSize?: number;
    level?: string;
    eventType?: string;
    startDate?: string;
    endDate?: string;
  }) => Effect.Effect<SystemLogsResponse, DatabaseError>;
  readonly clearLogs: () => Effect.Effect<void, DatabaseError>;
  readonly triggerInfoEvent: (
    message: string,
    eventType: string,
  ) => Effect.Effect<void, DatabaseError>;
}

export class SystemService extends Context.Tag("@bakarr/api/SystemService")<
  SystemService,
  SystemServiceShape
>() {}

const PAGE_SIZE = 50;

const makeSystemService = Effect.gen(function* () {
  const { db } = yield* Database;
  const config = yield* AppConfig;
  const runtime = yield* AppRuntime;
  const eventBus = yield* EventBus;

  const listProfiles = Effect.fn("SystemService.listProfiles")(function* () {
    const rows = yield* tryDatabasePromise(
      "Failed to load quality profiles",
      () => listQualityProfileRows(db),
    );
    return rows.map(decodeQualityProfileRow);
  });

  const createProfile = Effect.fn("SystemService.createProfile")(function* (
    profile: QualityProfile,
  ) {
    yield* tryDatabasePromise(
      "Failed to create quality profile",
      () => insertQualityProfileRow(db, encodeQualityProfileRow(profile)),
    );
    yield* tryDatabasePromise(
      "Failed to create quality profile",
      () =>
        appendSystemLog(
          db,
          "profiles.created",
          "success",
          `Quality profile '${profile.name}' created`,
        ),
    );
    return profile;
  });

  const deleteProfile = Effect.fn("SystemService.deleteProfile")(function* (
    name: string,
  ) {
    yield* tryDatabasePromise(
      "Failed to delete quality profile",
      () => deleteQualityProfileRow(db, name),
    );
    yield* tryDatabasePromise(
      "Failed to delete quality profile",
      () =>
        appendSystemLog(
          db,
          "profiles.deleted",
          "success",
          `Quality profile '${name}' deleted`,
        ),
    );
  });

  const listReleaseProfiles = Effect.fn(
    "SystemService.listReleaseProfiles",
  )(function* () {
    const rows = yield* tryDatabasePromise(
      "Failed to load release profiles",
      () => listReleaseProfileRows(db),
    );
    return rows.map(decodeReleaseProfileRow);
  });

  const createReleaseProfile = Effect.fn(
    "SystemService.createReleaseProfile",
  )(function* (
    input: Omit<ReleaseProfile, "id" | "enabled"> & { enabled?: boolean },
  ) {
    const created = yield* tryDatabasePromise(
      "Failed to create release profile",
      () =>
        insertReleaseProfileRow(db, {
          enabled: input.enabled ?? true,
          isGlobal: input.is_global,
          name: input.name,
          rules: encodeReleaseProfileRules(input.rules),
        }),
    );

    yield* tryDatabasePromise(
      "Failed to create release profile",
      () =>
        appendSystemLog(
          db,
          "release_profiles.created",
          "success",
          `Release profile '${input.name}' created`,
        ),
    );
    return decodeReleaseProfileRow(created);
  });

  const updateReleaseProfile = Effect.fn(
    "SystemService.updateReleaseProfile",
  )(function* (id: number, input: Omit<ReleaseProfile, "id">) {
    yield* tryDatabasePromise(
      "Failed to update release profile",
      () =>
        updateReleaseProfileRow(db, id, {
          enabled: input.enabled,
          isGlobal: input.is_global,
          name: input.name,
          rules: encodeReleaseProfileRules(input.rules),
        }),
    );

    yield* tryDatabasePromise(
      "Failed to update release profile",
      () =>
        appendSystemLog(
          db,
          "release_profiles.updated",
          "success",
          `Release profile '${input.name}' updated`,
        ),
    );
  });

  const deleteReleaseProfile = Effect.fn(
    "SystemService.deleteReleaseProfile",
  )(function* (id: number) {
    yield* tryDatabasePromise(
      "Failed to delete release profile",
      () => deleteReleaseProfileRow(db, id),
    );
    yield* tryDatabasePromise(
      "Failed to delete release profile",
      () =>
        appendSystemLog(
          db,
          "release_profiles.deleted",
          "success",
          `Release profile ${id} deleted`,
        ),
    );
  });

  const clearLogs = Effect.fn("SystemService.clearLogs")(function* () {
    yield* tryDatabasePromise(
      "Failed to clear system logs",
      () => db.delete(systemLogs),
    );
  });

  const triggerInfoEvent = Effect.fn("SystemService.triggerInfoEvent")(
    function* (message: string, eventType: string) {
      yield* tryDatabasePromise(
        "Failed to write system log",
        () => appendSystemLog(db, eventType, "info", message),
      );
      yield* eventBus.publish({ type: "Info", payload: { message } });
    },
  );

  const ensureInitialized = Effect.fn("SystemService.ensureInitialized")(
    function* () {
      const configRows = yield* tryDatabasePromise(
        "Failed to initialize system configuration",
        async () => {
          const row = await loadSystemConfigRow(db);
          return row ? [row] : [];
        },
      );

      if (configRows.length === 0) {
        yield* tryDatabasePromise(
          "Failed to initialize system configuration",
          () =>
            insertSystemConfigRow(db, {
              data: encodeConfigCore(makeDefaultConfig(config.databaseFile)),
              id: 1,
              updatedAt: nowIso(),
            }),
        );
      }

      const existingProfiles = yield* tryDatabasePromise(
        "Failed to initialize system configuration",
        async () => {
          const row = await loadAnyQualityProfileRow(db);
          return row ? [row] : [];
        },
      );

      if (existingProfiles.length === 0) {
        yield* tryDatabasePromise(
          "Failed to initialize system configuration",
          () =>
            insertQualityProfileRows(
              db,
              DEFAULT_PROFILES.map(encodeQualityProfileRow),
            ),
        );
      }
    },
  );

  const getSystemStatus = Effect.fn("SystemService.getSystemStatus")(
    function* () {
      const diskSpace = getDiskSpaceSafe(config.databaseFile);
      const queuedDownloads = yield* tryDatabasePromise(
        "Failed to build system status",
        () => countQueuedOrDownloadingDownloads(db),
      );
      const rssJob = yield* tryDatabasePromise(
        "Failed to build system status",
        () => loadBackgroundJobRow(db, "rss"),
      );
      const scanJob = yield* tryDatabasePromise(
        "Failed to build system status",
        () => loadBackgroundJobRow(db, "library_scan"),
      );

      return {
        active_torrents: queuedDownloads,
        disk_space: diskSpace,
        last_rss: rssJob?.lastSuccessAt ?? rssJob?.lastRunAt ?? null,
        last_scan: scanJob?.lastSuccessAt ?? scanJob?.lastRunAt ?? null,
        pending_downloads: queuedDownloads,
        uptime: Math.max(
          0,
          Math.floor((Date.now() - runtime.startedAt.getTime()) / 1000),
        ),
        version: config.appVersion,
      } satisfies SystemStatus;
    },
  );

  const getLibraryStats = Effect.fn("SystemService.getLibraryStats")(
    function* () {
      const totalAnime = yield* tryDatabasePromise(
        "Failed to load library stats",
        () => countAnimeRows(db),
      );
      const totalEpisodes = yield* tryDatabasePromise(
        "Failed to load library stats",
        () => countEpisodeRows(db),
      );
      const downloadedEpisodes = yield* tryDatabasePromise(
        "Failed to load library stats",
        () => countDownloadedEpisodeRows(db),
      );
      const totalRssFeeds = yield* tryDatabasePromise(
        "Failed to load library stats",
        () => countRssFeedRows(db),
      );
      const completedDownloads = yield* tryDatabasePromise(
        "Failed to load library stats",
        () => countCompletedDownloads(db),
      );

      return {
        downloaded_episodes: downloadedEpisodes,
        missing_episodes: Math.max(totalEpisodes - downloadedEpisodes, 0),
        recent_downloads: completedDownloads,
        rss_feeds: totalRssFeeds,
        total_anime: totalAnime,
        total_episodes: totalEpisodes,
      };
    },
  );

  const getActivity = Effect.fn("SystemService.getActivity")(function* () {
    const rows = yield* tryDatabasePromise(
      "Failed to load recent activity",
      () => listRecentSystemLogRows(db, 20),
    );

    return rows.map((row) => ({
      activity_type: row.eventType,
      anime_id: 0,
      anime_title: "Bakarr",
      description: row.message,
      id: row.id,
      timestamp: row.createdAt,
    }));
  });

  const getJobs = Effect.fn("SystemService.getJobs")(function* () {
    const currentConfig = yield* getConfig();
    const rows = yield* tryDatabasePromise(
      "Failed to load background jobs",
      () => listBackgroundJobRows(db),
    );
    const rowsByName = new Map(rows.map((row) => [row.name, row]));
    const names = backgroundJobNames(rows);

    return names.map((name) =>
      toBackgroundJobStatus(currentConfig, rowsByName.get(name), name)
    );
  });

  const getDashboard = Effect.fn("SystemService.getDashboard")(function* () {
    const currentConfig = yield* getConfig();
    const queuedDownloads = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () => countQueuedDownloads(db),
    );
    const activeDownloads = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () => countActiveDownloads(db),
    );
    const failedDownloads = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () => countFailedDownloads(db),
    );
    const importedDownloads = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () => countImportedDownloads(db),
    );
    const runningJobs = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () => countRunningBackgroundJobs(db),
    );
    const jobs = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () => listBackgroundJobRows(db),
    );
    const rowsByName = new Map(jobs.map((row) => [row.name, row]));
    const jobNames = backgroundJobNames(jobs);
    const events = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () => listRecentDownloadEventRows(db, 12),
    );

    return {
      active_downloads: activeDownloads,
      failed_downloads: failedDownloads,
      imported_downloads: importedDownloads,
      jobs: jobNames.map((name) =>
        toBackgroundJobStatus(currentConfig, rowsByName.get(name), name)
      ),
      queued_downloads: queuedDownloads,
      recent_download_events: events.map((row) => ({
        anime_id: row.animeId ?? undefined,
        created_at: row.createdAt,
        download_id: row.downloadId ?? undefined,
        event_type: row.eventType,
        from_status: row.fromStatus ?? undefined,
        id: row.id,
        message: row.message,
        metadata: row.metadata ?? undefined,
        to_status: row.toStatus ?? undefined,
      })),
      running_jobs: runningJobs,
    } as OpsDashboard;
  });

  const getConfig = Effect.fn("SystemService.getConfig")(function* () {
    const [storedConfig] = yield* tryDatabasePromise(
      "Failed to load system configuration",
      async () => {
        const row = await loadSystemConfigRow(db);
        return row ? [row] : [];
      },
    );
    const profiles = yield* tryDatabasePromise(
      "Failed to load system configuration",
      () => listQualityProfileRows(db),
    );

    const core = storedConfig
      ? decodeConfigCore(storedConfig.data)
      : makeDefaultConfig(config.databaseFile);

    return {
      ...core,
      profiles: profiles.map(decodeQualityProfileRow),
    } satisfies Config;
  });

  const updateConfig = Effect.fn("SystemService.updateConfig")(function* (
    nextConfig: Config,
  ) {
    const cronExpression = nextConfig.scheduler.cron_expression?.trim();

    if (nextConfig.scheduler.enabled && cronExpression) {
      const parsed = Cron.parse(cronExpression);

      if (Either.isLeft(parsed)) {
        return yield* new ConfigValidationError({
          message: "Invalid scheduler cron expression",
        });
      }
    }

    const core: ConfigCore = {
      downloads: nextConfig.downloads,
      general: nextConfig.general,
      library: nextConfig.library,
      nyaa: nextConfig.nyaa,
      qbittorrent: nextConfig.qbittorrent,
      scheduler: nextConfig.scheduler,
    };

    yield* tryDatabasePromise(
      "Failed to update system configuration",
      () =>
        updateSystemConfigAtomic(
          db,
          {
            data: encodeConfigCore(core),
            id: 1,
            updatedAt: nowIso(),
          },
          nextConfig.profiles.map(encodeQualityProfileRow),
        ),
    );

    setRuntimeLogLevel(nextConfig.general.log_level);

    return nextConfig;
  });

  const updateProfile = Effect.fn("SystemService.updateProfile")(function* (
    name: string,
    profile: QualityProfile,
  ) {
    const existing = yield* tryDatabasePromise(
      "Failed to update quality profile",
      async () => {
        const row = await loadQualityProfileRow(db, name);
        return row ? [row] : [];
      },
    );

    if (!existing[0]) {
      return yield* new ProfileNotFoundError({
        message: "Quality profile not found",
      });
    }

    yield* tryDatabasePromise(
      "Failed to update quality profile",
      () => updateQualityProfileRow(db, name, encodeQualityProfileRow(profile)),
    );
    yield* tryDatabasePromise(
      "Failed to update quality profile",
      () =>
        appendSystemLog(
          db,
          "profiles.updated",
          "success",
          `Quality profile '${name}' updated`,
        ),
    );

    return profile;
  });

  const getLogs = Effect.fn("SystemService.getLogs")(function* (input: {
    level?: string;
    eventType?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    pageSize?: number;
  }) {
    const safePage = Math.max(1, input.page);
    const safePageSize = Math.max(
      1,
      Math.min(input.pageSize ?? PAGE_SIZE, 10_000),
    );
    const { rows, total } = yield* tryDatabasePromise(
      "Failed to load system logs",
      () =>
        loadSystemLogPage(db, {
          endDate: input.endDate,
          eventType: input.eventType,
          level: input.level,
          page: safePage,
          pageSize: safePageSize,
          startDate: input.startDate,
        }),
    );

    return {
      logs: rows.map((row) => ({
        created_at: row.createdAt,
        details: row.details ?? undefined,
        event_type: row.eventType,
        id: row.id,
        level: normalizeLevel(row.level),
        message: row.message,
      })),
      total_pages: Math.max(1, Math.ceil(total / safePageSize)),
    } satisfies SystemLogsResponse;
  });

  return {
    ensureInitialized,
    getSystemStatus,
    getLibraryStats,
    getActivity,
    getJobs,
    getDashboard,
    getConfig,
    updateConfig,
    listProfiles,
    listQualities: () => Effect.succeed([...DEFAULT_QUALITIES]),
    createProfile,
    updateProfile,
    deleteProfile,
    listReleaseProfiles,
    createReleaseProfile,
    updateReleaseProfile,
    deleteReleaseProfile,
    getLogs,
    clearLogs,
    triggerInfoEvent,
  } satisfies SystemServiceShape;
});

export const SystemServiceLive = Layer.effect(SystemService, makeSystemService);

function tryDatabasePromise<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, DatabaseError> {
  return Effect.tryPromise({
    try: try_,
    catch: (cause) => new DatabaseError({ cause, message }),
  });
}
