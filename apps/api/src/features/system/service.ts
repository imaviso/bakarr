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
import {
  BackgroundWorkerController,
  BackgroundWorkerMonitor,
} from "../../background.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { systemLogs } from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { EventPublisher } from "../events/publisher.ts";
import {
  DEFAULT_PROFILES,
  DEFAULT_QUALITIES,
  makeDefaultConfig,
} from "./defaults.ts";
import {
  composeBackgroundJobStatuses,
  countRunningBackgroundJobStatuses,
  findBackgroundJobStatus,
} from "./background-status.ts";
import {
  persistAndActivateConfig,
  type PersistedSystemConfigState,
} from "./config-activation.ts";
import { setRuntimeLogLevel } from "../../lib/logging.ts";
import {
  ConfigValidationError,
  ProfileNotFoundError,
  StoredConfigCorruptError,
} from "./errors.ts";
import {
  type ConfigCore,
  effectDecodeConfigCore,
  effectDecodeQualityProfileRow,
  effectDecodeReleaseProfileRow,
  effectDecodeStoredConfigRow,
  encodeConfigCore,
  encodeQualityProfileRow,
  encodeReleaseProfileRules,
  tryDecodeConfigCore,
} from "./config-codec.ts";
import { appendSystemLog, normalizeLevel, nowIso } from "./support.ts";
import { getDiskSpaceSafe, selectStoragePath } from "./disk-space.ts";
import {
  countActiveDownloads,
  countAnimeRows,
  countAnimeUsingProfile,
  countCompletedDownloads,
  countDownloadedEpisodeRows,
  countEpisodeRows,
  countFailedDownloads,
  countImportedDownloads,
  countMonitoredAnimeRows,
  countQueuedDownloads,
  countRssFeedRows,
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
  loadQualityProfileRow,
  loadSystemConfigRow,
  loadSystemLogPage,
  renameQualityProfileWithCascade,
  updateReleaseProfileRow,
  updateSystemConfigAtomic,
} from "./repository.ts";

export interface SystemServiceShape {
  readonly ensureInitialized: () => Effect.Effect<void, DatabaseError>;
  readonly getSystemStatus: () => Effect.Effect<SystemStatus, DatabaseError>;
  readonly getLibraryStats: () => Effect.Effect<LibraryStats, DatabaseError>;
  readonly getActivity: () => Effect.Effect<ActivityItem[], DatabaseError>;
  readonly getJobs: () => Effect.Effect<
    BackgroundJobStatus[],
    DatabaseError | ConfigValidationError | StoredConfigCorruptError
  >;
  readonly getDashboard: () => Effect.Effect<
    OpsDashboard,
    DatabaseError | ConfigValidationError | StoredConfigCorruptError
  >;
  readonly getConfig: () => Effect.Effect<
    Config,
    DatabaseError | StoredConfigCorruptError
  >;
  readonly updateConfig: (
    config: Config,
  ) => Effect.Effect<
    Config,
    DatabaseError | ConfigValidationError | StoredConfigCorruptError
  >;
  readonly listProfiles: () => Effect.Effect<
    QualityProfile[],
    DatabaseError | StoredConfigCorruptError
  >;
  readonly listQualities: () => Effect.Effect<Quality[], never>;
  readonly createProfile: (
    profile: QualityProfile,
  ) => Effect.Effect<QualityProfile, DatabaseError>;
  readonly updateProfile: (
    name: string,
    profile: QualityProfile,
  ) => Effect.Effect<QualityProfile, DatabaseError | ProfileNotFoundError>;
  readonly deleteProfile: (
    name: string,
  ) => Effect.Effect<void, DatabaseError | ConfigValidationError>;
  readonly listReleaseProfiles: () => Effect.Effect<
    ReleaseProfile[],
    DatabaseError | StoredConfigCorruptError
  >;
  readonly createReleaseProfile: (
    input: Omit<ReleaseProfile, "id" | "enabled"> & { enabled?: boolean },
  ) => Effect.Effect<ReleaseProfile, DatabaseError | StoredConfigCorruptError>;
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
  const eventPublisher = yield* EventPublisher;
  const workerController = yield* BackgroundWorkerController;
  const backgroundWorkerMonitor = yield* BackgroundWorkerMonitor;

  const listProfiles = Effect.fn("SystemService.listProfiles")(function* () {
    const rows = yield* tryDatabasePromise(
      "Failed to load quality profiles",
      () => listQualityProfileRows(db),
    );
    return yield* Effect.forEach(rows, effectDecodeQualityProfileRow);
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
    const referencingAnime = yield* tryDatabasePromise(
      "Failed to delete quality profile",
      () => countAnimeUsingProfile(db, name),
    );

    if (referencingAnime > 0) {
      return yield* new ConfigValidationError({
        message:
          `Cannot delete profile '${name}': still referenced by ${referencingAnime} anime`,
      });
    }

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
    return yield* Effect.forEach(rows, effectDecodeReleaseProfileRow);
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
    return yield* effectDecodeReleaseProfileRow(created);
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
      yield* eventPublisher.publishInfo(message);
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

      const storedConfig = yield* tryDatabasePromise(
        "Failed to initialize system configuration",
        () => loadSystemConfigRow(db),
      );

      if (storedConfig) {
        const decoded = yield* effectDecodeConfigCore(storedConfig.data).pipe(
          Effect.either,
        );

        if (decoded._tag === "Right") {
          setRuntimeLogLevel(decoded.right.general.log_level);
        }
      }
    },
  );

  const loadComposedBackgroundJobs = Effect.fn(
    "SystemService.loadComposedBackgroundJobs",
  )(function* (currentConfig: Config, message: string) {
    const rows = yield* tryDatabasePromise(
      message,
      () => listBackgroundJobRows(db),
    );
    const liveSnapshot = yield* backgroundWorkerMonitor.snapshot();

    return composeBackgroundJobStatuses(currentConfig, liveSnapshot, rows);
  });

  const getSystemStatus = Effect.fn("SystemService.getSystemStatus")(
    function* () {
      const storedConfig = yield* tryDatabasePromise(
        "Failed to build system status",
        () => loadSystemConfigRow(db),
      );
      let core: ConfigCore;
      if (storedConfig) {
        const decoded = tryDecodeConfigCore(storedConfig.data);
        if (decoded) {
          core = decoded;
        } else {
          yield* Effect.logWarning(
            "Stored system config is corrupt, using defaults for status view",
          );
          core = makeDefaultConfig(config.databaseFile);
        }
      } else {
        core = makeDefaultConfig(config.databaseFile);
      }
      const storagePath = selectStoragePath({
        ...core,
        profiles: [],
      } as Config, config.databaseFile);
      const diskSpace = yield* getDiskSpaceSafe(storagePath);
      const queuedDownloads = yield* tryDatabasePromise(
        "Failed to build system status",
        () => countQueuedDownloads(db),
      );
      const activeDownloads = yield* tryDatabasePromise(
        "Failed to build system status",
        () => countActiveDownloads(db),
      );
      const jobs = yield* loadComposedBackgroundJobs(
        {
          ...core,
          profiles: [],
        } as Config,
        "Failed to build system status",
      );
      const rssJob = findBackgroundJobStatus(jobs, "rss");
      const scanJob = findBackgroundJobStatus(jobs, "library_scan");

      return {
        active_torrents: activeDownloads,
        disk_space: { free: diskSpace.free, total: diskSpace.total },
        last_rss: rssJob?.last_success_at ?? rssJob?.last_run_at ?? null,
        last_scan: scanJob?.last_success_at ?? scanJob?.last_run_at ?? null,
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
      const monitoredAnime = yield* tryDatabasePromise(
        "Failed to load library stats",
        () => countMonitoredAnimeRows(db),
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
        monitored_anime: monitoredAnime,
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
    return yield* loadComposedBackgroundJobs(
      currentConfig,
      "Failed to load background jobs",
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
    const jobs = yield* loadComposedBackgroundJobs(
      currentConfig,
      "Failed to load ops dashboard",
    );
    const events = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () => listRecentDownloadEventRows(db, 12),
    );

    return {
      active_downloads: activeDownloads,
      failed_downloads: failedDownloads,
      imported_downloads: importedDownloads,
      jobs,
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
      running_jobs: countRunningBackgroundJobStatuses(jobs),
    } as OpsDashboard;
  });

  const getConfig = Effect.fn("SystemService.getConfig")(function* () {
    const storedConfig = yield* tryDatabasePromise(
      "Failed to load system configuration",
      () => loadSystemConfigRow(db),
    );
    const profiles = yield* tryDatabasePromise(
      "Failed to load system configuration",
      () => listQualityProfileRows(db),
    );

    const core = yield* effectDecodeStoredConfigRow(storedConfig).pipe(
      Effect.catchTag(
        "StoredConfigMissingError",
        () => Effect.succeed(makeDefaultConfig(config.databaseFile)),
      ),
      Effect.catchTag(
        "StoredConfigCorruptError",
        () =>
          Effect.fail(
            new StoredConfigCorruptError({
              message:
                "Stored configuration is corrupt and could not be decoded. Re-save config to repair.",
            }),
          ),
      ),
    );

    return {
      ...core,
      profiles: yield* Effect.forEach(profiles, effectDecodeQualityProfileRow),
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

    const existingProfileRows = yield* tryDatabasePromise(
      "Failed to update system configuration",
      () => listQualityProfileRows(db),
    );

    // Guard: ensure no anime still references profiles being removed
    const keptProfileNames = new Set(nextConfig.profiles.map((p) => p.name));
    const removedProfileNames = existingProfileRows
      .map((row) => row.name)
      .filter((name) => !keptProfileNames.has(name));

    for (const removedProfileName of removedProfileNames) {
      const referencingAnime = yield* tryDatabasePromise(
        "Failed to update system configuration",
        () => countAnimeUsingProfile(db, removedProfileName),
      );

      if (referencingAnime > 0) {
        return yield* new ConfigValidationError({
          message:
            `Cannot remove profile '${removedProfileName}': still referenced by ${referencingAnime} anime`,
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

    const updatedAt = nowIso();
    const previousConfigRow = yield* tryDatabasePromise(
      "Failed to update system configuration",
      () => loadSystemConfigRow(db),
    );
    const previousState: PersistedSystemConfigState = {
      coreRow: previousConfigRow
        ? {
          data: previousConfigRow.data,
          id: previousConfigRow.id,
          updatedAt: previousConfigRow.updatedAt,
        }
        : {
          data: encodeConfigCore(makeDefaultConfig(config.databaseFile)),
          id: 1,
          updatedAt,
        },
      profileRows: existingProfileRows.map((row) => ({
        allowedQualities: row.allowedQualities,
        cutoff: row.cutoff,
        maxSize: row.maxSize,
        minSize: row.minSize,
        name: row.name,
        seadexPreferred: row.seadexPreferred,
        upgradeAllowed: row.upgradeAllowed,
      })),
    };
    const nextState: PersistedSystemConfigState = {
      coreRow: {
        data: encodeConfigCore(core),
        id: 1,
        updatedAt,
      },
      profileRows: nextConfig.profiles.map(encodeQualityProfileRow),
    };

    yield* persistAndActivateConfig({
      activateConfig: (value) => workerController.reload(value),
      nextConfig,
      nextState,
      persistState: (state) =>
        tryDatabasePromise(
          "Failed to update system configuration",
          () => updateSystemConfigAtomic(db, state.coreRow, state.profileRows),
        ),
      previousState,
    });

    yield* tryDatabasePromise(
      "Failed to update system configuration",
      () =>
        appendSystemLog(
          db,
          "system.config.updated",
          "success",
          "System configuration updated",
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
      () =>
        renameQualityProfileWithCascade(
          db,
          name,
          encodeQualityProfileRow(profile),
        ),
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
