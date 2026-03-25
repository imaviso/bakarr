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
import { BackgroundWorkerController, BackgroundWorkerMonitor } from "../../background.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { anime, episodes, systemLogs } from "../../db/schema.ts";
import { nowIsoFromClock, ClockService } from "../../lib/clock.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { EventPublisher } from "../events/publisher.ts";
import { AnimeStoredDataError } from "../anime/errors.ts";
import { toAnimeDto } from "../anime/dto.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "../operations/repository.ts";
import { OperationsStoredDataError } from "../operations/errors.ts";
import { DEFAULT_PROFILES, DEFAULT_QUALITIES, makeDefaultConfig } from "./defaults.ts";
import {
  composeBackgroundJobStatuses,
  countRunningBackgroundJobStatuses,
  findBackgroundJobStatus,
} from "./background-status.ts";
import { persistAndActivateConfig, type PersistedSystemConfigState } from "./config-activation.ts";
import { setRuntimeLogLevel } from "../../lib/logging.ts";
import { ConfigValidationError, ProfileNotFoundError, StoredConfigCorruptError } from "./errors.ts";
import {
  type ConfigCore,
  effectDecodeConfigCore,
  effectDecodeQualityProfileRow,
  effectDecodeReleaseProfileRow,
  effectDecodeStoredConfigRow,
  encodeConfigCore,
  encodeQualityProfileRow,
  encodeReleaseProfileRules,
} from "./config-codec.ts";
import { appendSystemLog, normalizeLevel } from "./support.ts";
import { DiskSpaceError, getDiskSpaceSafe, selectStoragePath } from "./disk-space.ts";
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
  readonly getDashboard: () => Effect.Effect<
    OpsDashboard,
    DatabaseError | ConfigValidationError | StoredConfigCorruptError | OperationsStoredDataError
  >;
  readonly getConfig: () => Effect.Effect<Config, DatabaseError | StoredConfigCorruptError>;
  readonly updateConfig: (
    config: Config,
  ) => Effect.Effect<Config, DatabaseError | ConfigValidationError | StoredConfigCorruptError>;
  readonly listProfiles: () => Effect.Effect<
    QualityProfile[],
    DatabaseError | StoredConfigCorruptError
  >;
  readonly listQualities: () => Effect.Effect<Quality[], never>;
  readonly createProfile: (profile: QualityProfile) => Effect.Effect<QualityProfile, DatabaseError>;
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
  readonly deleteReleaseProfile: (id: number) => Effect.Effect<void, DatabaseError>;
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
  const clock = yield* ClockService;
  const eventPublisher = yield* EventPublisher;
  const workerController = yield* BackgroundWorkerController;
  const backgroundWorkerMonitor = yield* BackgroundWorkerMonitor;
  const nowIso = () => nowIsoFromClock(clock);
  const currentTimeMillis = () => clock.currentTimeMillis;

  const listProfiles = Effect.fn("SystemService.listProfiles")(function* () {
    const rows = yield* listQualityProfileRows(db);
    return yield* Effect.forEach(rows, effectDecodeQualityProfileRow);
  });

  const createProfile = Effect.fn("SystemService.createProfile")(function* (
    profile: QualityProfile,
  ) {
    yield* insertQualityProfileRow(db, encodeQualityProfileRow(profile));
    yield* appendSystemLog(
      db,
      "profiles.created",
      "success",
      `Quality profile '${profile.name}' created`,
      nowIso,
    );
    return profile;
  });

  const deleteProfile = Effect.fn("SystemService.deleteProfile")(function* (name: string) {
    const referencingAnime = yield* countAnimeUsingProfile(db, name);

    if (referencingAnime > 0) {
      return yield* new ConfigValidationError({
        message: `Cannot delete profile '${name}': still referenced by ${referencingAnime} anime`,
      });
    }

    yield* deleteQualityProfileRow(db, name);
    yield* appendSystemLog(
      db,
      "profiles.deleted",
      "success",
      `Quality profile '${name}' deleted`,
      nowIso,
    );
  });

  const listReleaseProfiles = Effect.fn("SystemService.listReleaseProfiles")(function* () {
    const rows = yield* listReleaseProfileRows(db);
    return yield* Effect.forEach(rows, effectDecodeReleaseProfileRow);
  });

  const createReleaseProfile = Effect.fn("SystemService.createReleaseProfile")(function* (
    input: Omit<ReleaseProfile, "id" | "enabled"> & { enabled?: boolean },
  ) {
    const created = yield* insertReleaseProfileRow(db, {
      enabled: input.enabled ?? true,
      isGlobal: input.is_global,
      name: input.name,
      rules: encodeReleaseProfileRules(input.rules),
    });

    yield* appendSystemLog(
      db,
      "release_profiles.created",
      "success",
      `Release profile '${input.name}' created`,
      nowIso,
    );
    return yield* effectDecodeReleaseProfileRow(created);
  });

  const updateReleaseProfile = Effect.fn("SystemService.updateReleaseProfile")(function* (
    id: number,
    input: Omit<ReleaseProfile, "id">,
  ) {
    yield* updateReleaseProfileRow(db, id, {
      enabled: input.enabled,
      isGlobal: input.is_global,
      name: input.name,
      rules: encodeReleaseProfileRules(input.rules),
    });

    yield* appendSystemLog(
      db,
      "release_profiles.updated",
      "success",
      `Release profile '${input.name}' updated`,
      nowIso,
    );
  });

  const deleteReleaseProfile = Effect.fn("SystemService.deleteReleaseProfile")(function* (
    id: number,
  ) {
    yield* deleteReleaseProfileRow(db, id);
    yield* appendSystemLog(
      db,
      "release_profiles.deleted",
      "success",
      `Release profile ${id} deleted`,
      nowIso,
    );
  });

  const clearLogs = Effect.fn("SystemService.clearLogs")(function* () {
    yield* tryDatabasePromise("Failed to clear system logs", () => db.delete(systemLogs));
  });

  const triggerInfoEvent = Effect.fn("SystemService.triggerInfoEvent")(function* (
    message: string,
    eventType: string,
  ) {
    yield* appendSystemLog(db, eventType, "info", message, nowIso);
    yield* eventPublisher.publishInfo(message);
  });

  /**
   * First-run initialization (idempotent):
   *
   * - Inserts default system config row if none exists.
   * - Inserts default quality profiles if none exist.
   * - Applies the stored log level when config is decodable.
   *
   * Does NOT repair corrupt config — a corrupt row is silently skipped here
   * (log level stays at default). The corrupt-config repair contract is
   * handled by {@link getConfig} which surfaces StoredConfigCorruptError to
   * the caller so the operator can re-save via the UI.
   */
  const ensureInitialized = Effect.fn("SystemService.ensureInitialized")(function* () {
    const configRow = yield* loadSystemConfigRow(db);

    if (!configRow) {
      const initNow = yield* nowIso();
      yield* insertSystemConfigRow(db, {
        data: encodeConfigCore(makeDefaultConfig(config.databaseFile)),
        id: 1,
        updatedAt: initNow,
      });
    }

    const existingProfile = yield* loadAnyQualityProfileRow(db);

    if (!existingProfile) {
      yield* insertQualityProfileRows(db, DEFAULT_PROFILES.map(encodeQualityProfileRow));
    }

    const storedConfig = yield* loadSystemConfigRow(db);

    if (storedConfig) {
      const decoded = yield* effectDecodeConfigCore(storedConfig.data).pipe(Effect.either);

      if (decoded._tag === "Right") {
        setRuntimeLogLevel(decoded.right.general.log_level);
      }
    }
  });

  const loadComposedBackgroundJobs = Effect.fn("SystemService.loadComposedBackgroundJobs")(
    function* (currentConfig: Config) {
      const rows = yield* listBackgroundJobRows(db);
      const liveSnapshot = yield* backgroundWorkerMonitor.snapshot();

      return composeBackgroundJobStatuses(currentConfig, liveSnapshot, rows);
    },
  );

  const getSystemStatus = Effect.fn("SystemService.getSystemStatus")(function* () {
    const storedConfig = yield* loadSystemConfigRow(db);

    const core = storedConfig
      ? yield* effectDecodeConfigCore(storedConfig.data)
      : makeDefaultConfig(config.databaseFile);

    const storagePath = selectStoragePath(
      {
        ...core,
        profiles: [],
      } as Config,
      config.databaseFile,
    );
    const diskSpace = yield* getDiskSpaceSafe(storagePath);
    const queuedDownloads = yield* countQueuedDownloads(db);
    const activeDownloads = yield* countActiveDownloads(db);
    const jobs = yield* loadComposedBackgroundJobs({
      ...core,
      profiles: [],
    } as Config);
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
      version: config.appVersion,
    } satisfies SystemStatus;
  });

  const getLibraryStats = Effect.fn("SystemService.getLibraryStats")(function* () {
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

  const getActivity = Effect.fn("SystemService.getActivity")(function* () {
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

  const getJobs = Effect.fn("SystemService.getJobs")(function* () {
    const currentConfig = yield* getConfig();
    return yield* loadComposedBackgroundJobs(currentConfig);
  });

  const getDashboard = Effect.fn("SystemService.getDashboard")(function* () {
    const currentConfig = yield* getConfig();
    const queuedDownloads = yield* countQueuedDownloads(db);
    const activeDownloads = yield* countActiveDownloads(db);
    const failedDownloads = yield* countFailedDownloads(db);
    const importedDownloads = yield* countImportedDownloads(db);
    const jobs = yield* loadComposedBackgroundJobs(currentConfig);
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

  /**
   * Corrupt-config repair contract:
   *
   * - **Missing config** → returns defaults silently (first-run or wiped DB).
   * - **Corrupt config** → fails with {@link StoredConfigCorruptError}.
   *   The error message tells the operator to "re-save config to repair".
   *   The caller (main.ts, route handlers) decides the degradation policy:
   *   - At startup: skip background workers, start the API so the UI is
   *     reachable for config re-save.
   *   - In request handlers: return the error to the client.
   * - **Valid config** → merge stored values over defaults (library section
   *   uses spread to pick up new default keys added in later versions).
   *
   * The repair action itself is {@link updateConfig}: any successful save
   * overwrites the stored row with a freshly-encoded value, clearing
   * corruption.
   */
  const getConfig = Effect.fn("SystemService.getConfig")(function* () {
    const storedConfig = yield* loadSystemConfigRow(db);
    const profiles = yield* listQualityProfileRows(db);

    const core = yield* effectDecodeStoredConfigRow(storedConfig).pipe(
      Effect.catchTag("StoredConfigMissingError", () =>
        Effect.succeed(makeDefaultConfig(config.databaseFile)),
      ),
      Effect.catchTag("StoredConfigCorruptError", () =>
        Effect.fail(
          new StoredConfigCorruptError({
            message:
              "Stored configuration is corrupt and could not be decoded. Re-save config to repair.",
          }),
        ),
      ),
    );
    const defaults = makeDefaultConfig(config.databaseFile);

    return {
      ...core,
      library: {
        ...defaults.library,
        ...core.library,
      },
      profiles: yield* Effect.forEach(profiles, effectDecodeQualityProfileRow),
    } satisfies Config;
  });

  const updateConfig = Effect.fn("SystemService.updateConfig")(function* (nextConfig: Config) {
    const cronExpression = nextConfig.scheduler.cron_expression?.trim();

    if (nextConfig.scheduler.enabled && cronExpression) {
      const parsed = Cron.parse(cronExpression);

      if (Either.isLeft(parsed)) {
        return yield* new ConfigValidationError({
          message: "Invalid scheduler cron expression",
        });
      }
    }

    const existingProfileRows = yield* listQualityProfileRows(db);

    // Guard: ensure no anime still references profiles being removed
    const keptProfileNames = new Set(nextConfig.profiles.map((p) => p.name));
    const removedProfileNames = existingProfileRows
      .map((row) => row.name)
      .filter((name) => !keptProfileNames.has(name));

    for (const removedProfileName of removedProfileNames) {
      const referencingAnime = yield* countAnimeUsingProfile(db, removedProfileName);

      if (referencingAnime > 0) {
        return yield* new ConfigValidationError({
          message: `Cannot remove profile '${removedProfileName}': still referenced by ${referencingAnime} anime`,
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

    const updatedAt = yield* nowIso();
    const previousConfigRow = yield* loadSystemConfigRow(db);
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
      persistState: (state) => updateSystemConfigAtomic(db, state.coreRow, state.profileRows),
      previousState,
    });

    yield* appendSystemLog(
      db,
      "system.config.updated",
      "success",
      "System configuration updated",
      nowIso,
    );

    setRuntimeLogLevel(nextConfig.general.log_level);

    return nextConfig;
  });

  const updateProfile = Effect.fn("SystemService.updateProfile")(function* (
    name: string,
    profile: QualityProfile,
  ) {
    const existing = yield* loadQualityProfileRow(db, name);

    if (!existing) {
      return yield* new ProfileNotFoundError({
        message: "Quality profile not found",
      });
    }

    yield* renameQualityProfileWithCascade(db, name, encodeQualityProfileRow(profile));
    yield* appendSystemLog(
      db,
      "profiles.updated",
      "success",
      `Quality profile '${name}' updated`,
      nowIso,
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
    const safePageSize = Math.max(1, Math.min(input.pageSize ?? PAGE_SIZE, 10_000));
    const { rows, total } = yield* loadSystemLogPage(db, {
      endDate: input.endDate,
      eventType: input.eventType,
      level: input.level,
      page: safePage,
      pageSize: safePageSize,
      startDate: input.startDate,
    });

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
