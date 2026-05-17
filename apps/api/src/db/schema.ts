import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const media = sqliteTable("media", {
  id: integer("id").primaryKey(),
  mediaKind: text("media_kind").notNull().default("anime"),
  malId: integer("mal_id"),
  titleRomaji: text("title_romaji").notNull(),
  titleEnglish: text("title_english"),
  titleNative: text("title_native"),
  format: text("format").notNull(),
  description: text("description"),
  background: text("background"),
  source: text("source"),
  duration: text("duration"),
  rating: text("rating"),
  rank: integer("rank"),
  popularity: integer("popularity"),
  members: integer("members"),
  favorites: integer("favorites"),
  score: integer("score"),
  genres: text("genres").notNull(),
  studios: text("studios").notNull(),
  coverImage: text("cover_image"),
  bannerImage: text("banner_image"),
  status: text("status").notNull(),
  unitCount: integer("unit_count"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  startYear: integer("start_year"),
  endYear: integer("end_year"),
  nextAiringAt: text("next_airing_at"),
  nextAiringUnit: integer("next_airing_unit"),
  synonyms: text("synonyms"),
  relatedMedia: text("related_media"),
  recommendedMedia: text("recommended_media"),
  profileName: text("profile_name").notNull(),
  rootFolder: text("root_folder").notNull(),
  addedAt: text("added_at").notNull(),
  monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
  releaseProfileIds: text("release_profile_ids").notNull(),
});

export const mediaUnits = sqliteTable(
  "media_units",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mediaId: integer("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title"),
    aired: text("aired"),
    downloaded: integer("downloaded", { mode: "boolean" }).notNull().default(false),
    filePath: text("file_path"),
    fileSize: integer("file_size"),
    durationSeconds: integer("duration_seconds"),
    groupName: text("group_name"),
    resolution: text("resolution"),
    quality: text("quality"),
    videoCodec: text("video_codec"),
    audioCodec: text("audio_codec"),
    audioChannels: text("audio_channels"),
  },
  (table) => [
    unique("media_unit_unique").on(table.mediaId, table.number),
    index("media_units_media_aired_idx").on(table.mediaId, table.aired),
  ],
);

export const anidbEpisodeCache = sqliteTable("anidb_episode_cache", {
  mediaId: integer("media_id").primaryKey(),
  mediaUnits: text("episodes").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const seasonalAnimeCache = sqliteTable("seasonal_anime_cache", {
  cacheKey: text("cache_key").primaryKey(),
  season: text("season").notNull(),
  year: integer("year").notNull(),
  page: integer("page").notNull(),
  limit: integer("limit").notNull(),
  payload: text("payload").notNull(),
  fetchedAtMs: integer("fetched_at_ms").notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  apiKey: text("api_key").notNull().unique(),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const systemLogs = sqliteTable("system_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventType: text("event_type").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  details: text("details"),
  createdAt: text("created_at").notNull(),
});

export const appConfig = sqliteTable("app_config", {
  id: integer("id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: text("updated_at").notNull(),
  bootstrapPassword: text("bootstrap_password"),
});

export const qualityProfiles = sqliteTable("quality_profiles", {
  name: text("name").primaryKey(),
  cutoff: text("cutoff").notNull(),
  upgradeAllowed: integer("upgrade_allowed", { mode: "boolean" }).notNull(),
  seadexPreferred: integer("seadex_preferred", { mode: "boolean" }).notNull(),
  allowedQualities: text("allowed_qualities").notNull(),
  minSize: text("min_size"),
  maxSize: text("max_size"),
});

export const releaseProfiles = sqliteTable("release_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  isGlobal: integer("is_global", { mode: "boolean" }).notNull().default(false),
  rules: text("rules").notNull(),
});

export const rssFeeds = sqliteTable("rss_feeds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mediaId: integer("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  name: text("name"),
  lastChecked: text("last_checked"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const downloads = sqliteTable("downloads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mediaId: integer("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" }),
  mediaTitle: text("media_title").notNull(),
  unitNumber: integer("unit_number").notNull(),
  isBatch: integer("is_batch", { mode: "boolean" }).notNull().default(false),
  coveredUnits: text("covered_units"),
  torrentName: text("torrent_name").notNull(),
  status: text("status").notNull(),
  progress: integer("progress"),
  addedAt: text("added_at").notNull(),
  downloadDate: text("download_date"),
  groupName: text("group_name"),
  magnet: text("magnet"),
  infoHash: text("info_hash").unique(),
  externalState: text("external_state"),
  errorMessage: text("error_message"),
  savePath: text("save_path"),
  contentPath: text("content_path"),
  totalBytes: integer("total_bytes"),
  downloadedBytes: integer("downloaded_bytes"),
  speedBytes: integer("speed_bytes"),
  etaSeconds: integer("eta_seconds"),
  sourceMetadata: text("source_metadata"),
  lastSyncedAt: text("last_synced_at"),
  retryCount: integer("retry_count").notNull().default(0),
  lastErrorAt: text("last_error_at"),
  reconciledAt: text("reconciled_at"),
});

export const backgroundJobs = sqliteTable("background_jobs", {
  name: text("name").primaryKey(),
  isRunning: integer("is_running", { mode: "boolean" }).notNull().default(false),
  lastRunAt: text("last_run_at"),
  lastSuccessAt: text("last_success_at"),
  lastStatus: text("last_status"),
  lastMessage: text("last_message"),
  progressCurrent: integer("progress_current"),
  progressTotal: integer("progress_total"),
  runCount: integer("run_count").notNull().default(0),
});

export const operationsTasks = sqliteTable(
  "operations_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskKey: text("task_key").notNull(),
    status: text("status").notNull(),
    progressCurrent: integer("progress_current"),
    progressTotal: integer("progress_total"),
    message: text("message"),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    updatedAt: text("updated_at").notNull(),
    mediaId: integer("media_id"),
    payload: text("payload"),
  },
  (table) => [
    index("operations_tasks_key_created_idx").on(table.taskKey, table.createdAt),
    index("operations_tasks_status_updated_idx").on(table.status, table.updatedAt),
  ],
);

export const unmappedFolderMatches = sqliteTable("unmapped_folder_matches", {
  path: text("path").primaryKey(),
  name: text("name").notNull(),
  size: integer("size").notNull().default(0),
  matchStatus: text("match_status").notNull().default("pending"),
  matchAttempts: integer("match_attempts").notNull().default(0),
  suggestedMatches: text("suggested_matches").notNull().default("[]"),
  lastMatchedAt: text("last_matched_at"),
  lastMatchError: text("last_match_error"),
  updatedAt: text("updated_at").notNull(),
});

export const downloadEvents = sqliteTable("download_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  downloadId: integer("download_id"),
  mediaId: integer("media_id"),
  eventType: text("event_type").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  message: text("message").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
});

export const libraryRoots = sqliteTable("library_roots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  path: text("path").notNull().unique(),
});

export type UserRow = typeof users.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type MediaUnitRow = typeof mediaUnits.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type SystemLogRow = typeof systemLogs.$inferSelect;
export type AppConfigRow = typeof appConfig.$inferSelect;
export type QualityProfileRow = typeof qualityProfiles.$inferSelect;
export type ReleaseProfileRow = typeof releaseProfiles.$inferSelect;
export type RssFeedRow = typeof rssFeeds.$inferSelect;
export type DownloadRow = typeof downloads.$inferSelect;
export type BackgroundJobRow = typeof backgroundJobs.$inferSelect;
export type DownloadEventRow = typeof downloadEvents.$inferSelect;
export type LibraryRoot = typeof libraryRoots.$inferSelect;
export type UnmappedFolderMatchRow = typeof unmappedFolderMatches.$inferSelect;
export type SeasonalAnimeCacheRow = typeof seasonalAnimeCache.$inferSelect;
export type OperationsTaskRow = typeof operationsTasks.$inferSelect;
