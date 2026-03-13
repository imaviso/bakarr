import { and, count, desc, eq, sql } from "drizzle-orm";
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
import {
  anime,
  appConfig,
  backgroundJobs,
  downloadEvents,
  downloads,
  episodes,
  qualityProfiles,
  releaseProfiles,
  rssFeeds,
  systemLogs,
} from "../../db/schema.ts";
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
  eventTypeCondition,
  getDiskSpaceSafe,
  normalizeLevel,
  nowIso,
  toBackgroundJobStatus,
} from "./support.ts";

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
      () => db.select().from(qualityProfiles).orderBy(qualityProfiles.name),
    );
    return rows.map(decodeQualityProfileRow);
  });

  const createProfile = Effect.fn("SystemService.createProfile")(function* (
    profile: QualityProfile,
  ) {
    yield* tryDatabasePromise(
      "Failed to create quality profile",
      () => db.insert(qualityProfiles).values(encodeQualityProfileRow(profile)),
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
      () => db.delete(qualityProfiles).where(eq(qualityProfiles.name, name)),
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
      () => db.select().from(releaseProfiles).orderBy(releaseProfiles.id),
    );
    return rows.map(decodeReleaseProfileRow);
  });

  const createReleaseProfile = Effect.fn(
    "SystemService.createReleaseProfile",
  )(function* (
    input: Omit<ReleaseProfile, "id" | "enabled"> & { enabled?: boolean },
  ) {
    const [created] = yield* tryDatabasePromise(
      "Failed to create release profile",
      () =>
        db.insert(releaseProfiles).values({
          enabled: input.enabled ?? true,
          isGlobal: input.is_global,
          name: input.name,
          rules: encodeReleaseProfileRules(input.rules),
        }).returning(),
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
        db.update(releaseProfiles).set({
          enabled: input.enabled,
          isGlobal: input.is_global,
          name: input.name,
          rules: encodeReleaseProfileRules(input.rules),
        }).where(eq(releaseProfiles.id, id)),
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
      () => db.delete(releaseProfiles).where(eq(releaseProfiles.id, id)),
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
        () => db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
      );

      if (configRows.length === 0) {
        yield* tryDatabasePromise(
          "Failed to initialize system configuration",
          () =>
            db.insert(appConfig).values({
              data: encodeConfigCore(makeDefaultConfig(config.databaseFile)),
              id: 1,
              updatedAt: nowIso(),
            }),
        );
      }

      const existingProfiles = yield* tryDatabasePromise(
        "Failed to initialize system configuration",
        () => db.select().from(qualityProfiles).limit(1),
      );

      if (existingProfiles.length === 0) {
        yield* tryDatabasePromise(
          "Failed to initialize system configuration",
          () =>
            db.insert(qualityProfiles).values(
              DEFAULT_PROFILES.map(encodeQualityProfileRow),
            ),
        );
      }
    },
  );

  const getSystemStatus = Effect.fn("SystemService.getSystemStatus")(
    function* () {
      const diskSpace = getDiskSpaceSafe(config.databaseFile);
      const [{ value: queuedDownloads }] = yield* tryDatabasePromise(
        "Failed to build system status",
        () =>
          db.select({ value: count() }).from(downloads).where(
            sql`${downloads.status} in ('queued', 'downloading')`,
          ),
      );
      const [rssJob] = yield* tryDatabasePromise(
        "Failed to build system status",
        () =>
          db.select().from(backgroundJobs).where(eq(backgroundJobs.name, "rss"))
            .limit(1),
      );
      const [scanJob] = yield* tryDatabasePromise(
        "Failed to build system status",
        () =>
          db.select().from(backgroundJobs).where(
            eq(backgroundJobs.name, "library_scan"),
          ).limit(1),
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
      const [{ value: totalAnime }] = yield* tryDatabasePromise(
        "Failed to load library stats",
        () => db.select({ value: count() }).from(anime),
      );
      const [{ value: totalEpisodes }] = yield* tryDatabasePromise(
        "Failed to load library stats",
        () => db.select({ value: count() }).from(episodes),
      );
      const [{ value: downloadedEpisodes }] = yield* tryDatabasePromise(
        "Failed to load library stats",
        () =>
          db.select({ value: count() }).from(episodes).where(
            eq(episodes.downloaded, true),
          ),
      );
      const [{ value: totalRssFeeds }] = yield* tryDatabasePromise(
        "Failed to load library stats",
        () => db.select({ value: count() }).from(rssFeeds),
      );
      const [{ value: completedDownloads }] = yield* tryDatabasePromise(
        "Failed to load library stats",
        () =>
          db.select({ value: count() }).from(downloads).where(
            eq(downloads.status, "completed"),
          ),
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
      () => db.select().from(systemLogs).orderBy(desc(systemLogs.id)).limit(20),
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
      () => db.select().from(backgroundJobs).orderBy(backgroundJobs.name),
    );
    const rowsByName = new Map(rows.map((row) => [row.name, row]));
    const names = [
      ...new Set([
        "download_sync",
        "library_scan",
        "rss",
        "unmapped_scan",
        ...rows.map((row) => row.name),
      ]),
    ].sort();

    return names.map((name) =>
      toBackgroundJobStatus(currentConfig, rowsByName.get(name), name)
    );
  });

  const getDashboard = Effect.fn("SystemService.getDashboard")(function* () {
    const currentConfig = yield* getConfig();
    const [{ value: queuedDownloads }] = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () =>
        db.select({ value: count() }).from(downloads).where(
          eq(downloads.status, "queued"),
        ),
    );
    const [{ value: activeDownloads }] = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () =>
        db.select({ value: count() }).from(downloads).where(
          sql`${downloads.status} in ('downloading', 'paused')`,
        ),
    );
    const [{ value: failedDownloads }] = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () =>
        db.select({ value: count() }).from(downloads).where(
          eq(downloads.status, "error"),
        ),
    );
    const [{ value: importedDownloads }] = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () =>
        db.select({ value: count() }).from(downloads).where(
          eq(downloads.status, "imported"),
        ),
    );
    const [{ value: runningJobs }] = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () =>
        db.select({ value: count() }).from(backgroundJobs).where(
          eq(backgroundJobs.isRunning, true),
        ),
    );
    const jobs = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () => db.select().from(backgroundJobs).orderBy(backgroundJobs.name),
    );
    const rowsByName = new Map(jobs.map((row) => [row.name, row]));
    const jobNames = [
      ...new Set([
        "download_sync",
        "library_scan",
        "rss",
        "unmapped_scan",
        ...jobs.map((row) => row.name),
      ]),
    ].sort();
    const events = yield* tryDatabasePromise(
      "Failed to load ops dashboard",
      () =>
        db.select().from(downloadEvents).orderBy(desc(downloadEvents.id)).limit(
          12,
        ),
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
      () => db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
    );
    const profiles = yield* tryDatabasePromise(
      "Failed to load system configuration",
      () => db.select().from(qualityProfiles).orderBy(qualityProfiles.name),
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
      security: nextConfig.security,
    };

    yield* tryDatabasePromise(
      "Failed to update system configuration",
      () =>
        db.insert(appConfig)
          .values({ data: encodeConfigCore(core), id: 1, updatedAt: nowIso() })
          .onConflictDoUpdate({
            target: appConfig.id,
            set: { data: encodeConfigCore(core), updatedAt: nowIso() },
          }),
    );

    yield* tryDatabasePromise(
      "Failed to update system configuration",
      () => db.delete(qualityProfiles),
    );

    if (nextConfig.profiles.length > 0) {
      yield* tryDatabasePromise(
        "Failed to update system configuration",
        () =>
          db.insert(qualityProfiles).values(
            nextConfig.profiles.map(encodeQualityProfileRow),
          ),
      );
    }

    setRuntimeLogLevel(nextConfig.general.log_level);

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

    return nextConfig;
  });

  const updateProfile = Effect.fn("SystemService.updateProfile")(function* (
    name: string,
    profile: QualityProfile,
  ) {
    const existing = yield* tryDatabasePromise(
      "Failed to update quality profile",
      () =>
        db.select().from(qualityProfiles).where(eq(qualityProfiles.name, name))
          .limit(1),
    );

    if (!existing[0]) {
      return yield* new ProfileNotFoundError({
        message: "Quality profile not found",
      });
    }

    yield* tryDatabasePromise(
      "Failed to update quality profile",
      () =>
        db.update(qualityProfiles).set(encodeQualityProfileRow(profile)).where(
          eq(qualityProfiles.name, name),
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
    const conditions = [
      input.level ? eq(systemLogs.level, input.level) : undefined,
      input.eventType ? eventTypeCondition(input.eventType) : undefined,
      input.startDate
        ? sql`${systemLogs.createdAt} >= ${input.startDate}`
        : undefined,
      input.endDate
        ? sql`${systemLogs.createdAt} <= ${input.endDate}`
        : undefined,
    ].filter((value): value is Exclude<typeof value, undefined> =>
      value !== undefined
    );
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const countQuery = db.select({ value: count() }).from(systemLogs);
    const rowsQuery = db.select().from(systemLogs).orderBy(desc(systemLogs.id))
      .limit(
        safePageSize,
      ).offset((safePage - 1) * safePageSize);

    const [{ value: totalLogs }] = yield* tryDatabasePromise(
      "Failed to load system logs",
      () => (whereClause ? countQuery.where(whereClause) : countQuery),
    );

    const rows = yield* tryDatabasePromise(
      "Failed to load system logs",
      () => whereClause ? rowsQuery.where(whereClause) : rowsQuery,
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
      total_pages: Math.max(1, Math.ceil(totalLogs / safePageSize)),
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
