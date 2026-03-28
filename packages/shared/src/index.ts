import { Schema } from "effect";

export const RULE_TYPE_VALUES = ["preferred", "must", "must_not"] as const;
export type RuleType = (typeof RULE_TYPE_VALUES)[number];
export const RuleTypeSchema: Schema.Schema<RuleType> = Schema.Literal(...RULE_TYPE_VALUES);

export const IMPORT_MODE_VALUES = ["copy", "move"] as const;
export type ImportMode = (typeof IMPORT_MODE_VALUES)[number];
export const ImportModeSchema: Schema.Schema<ImportMode> = Schema.Literal(...IMPORT_MODE_VALUES);

export const PREFERRED_TITLE_VALUES = ["romaji", "english", "native"] as const;
export type PreferredTitle = (typeof PREFERRED_TITLE_VALUES)[number];
export const PreferredTitleSchema: Schema.Schema<PreferredTitle> = Schema.Literal(
  ...PREFERRED_TITLE_VALUES,
);

export type ApiResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export function ApiResultSchema<A, I, R>(
  data: Schema.Schema<A, I, R>,
): Schema.Schema<ApiResult<A>, ApiResult<I>, R> {
  return Schema.Union(
    Schema.Struct({
      ok: Schema.Literal(true),
      data,
    }),
    Schema.Struct({
      ok: Schema.Literal(false),
      error: Schema.String,
    }),
  );
}

export interface HealthStatus {
  status: "ok";
}

export const HealthStatusSchema: Schema.Schema<HealthStatus> = Schema.Struct({
  status: Schema.Literal("ok"),
});

export interface AuthUser {
  id: number;
  username: string;
  created_at: string;
  updated_at: string;
  must_change_password: boolean;
}

export const AuthUserSchema: Schema.Schema<AuthUser> = Schema.Struct({
  id: Schema.Number,
  username: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  must_change_password: Schema.Boolean,
});

export interface LoginRequest {
  username: string;
  password: string;
}

export const LoginRequestSchema: Schema.Schema<LoginRequest> = Schema.Struct({
  username: Schema.String,
  password: Schema.String,
});

export interface ApiKeyLoginRequest {
  api_key: string;
}

export const ApiKeyLoginRequestSchema: Schema.Schema<ApiKeyLoginRequest> = Schema.Struct({
  api_key: Schema.String,
});

export interface LoginResponse {
  username: string;
  api_key: string;
  must_change_password: boolean;
}

export const LoginResponseSchema: Schema.Schema<LoginResponse> = Schema.Struct({
  username: Schema.String,
  api_key: Schema.String,
  must_change_password: Schema.Boolean,
});

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export const ChangePasswordRequestSchema: Schema.Schema<ChangePasswordRequest> = Schema.Struct({
  current_password: Schema.String,
  new_password: Schema.String,
});

export interface ApiKeyResponse {
  api_key: string;
}

export const ApiKeyResponseSchema: Schema.Schema<ApiKeyResponse> = Schema.Struct({
  api_key: Schema.String,
});

export interface EpisodeProgress {
  downloaded: number;
  downloaded_percent?: number;
  is_up_to_date?: boolean;
  latest_downloaded_episode?: number;
  total?: number;
  missing: number[];
  next_missing_episode?: number;
}

export const EpisodeProgressSchema: Schema.Schema<EpisodeProgress> = Schema.mutable(
  Schema.Struct({
    downloaded: Schema.Number,
    downloaded_percent: Schema.optional(Schema.Number),
    is_up_to_date: Schema.optional(Schema.Boolean),
    latest_downloaded_episode: Schema.optional(Schema.Number),
    total: Schema.optional(Schema.Number),
    missing: Schema.mutable(Schema.Array(Schema.Number)),
    next_missing_episode: Schema.optional(Schema.Number),
  }),
);

export type AnimeSeason = "winter" | "spring" | "summer" | "fall";

export const AnimeSeasonSchema: Schema.Schema<AnimeSeason> = Schema.Literal(
  "winter",
  "spring",
  "summer",
  "fall",
);

export const AnimeTitleSchema: Schema.Schema<Anime["title"]> = Schema.Struct({
  romaji: Schema.String,
  english: Schema.optional(Schema.String),
  native: Schema.optional(Schema.String),
});

export interface NextAiringEpisode {
  episode: number;
  airing_at: string;
}

export const NextAiringEpisodeSchema: Schema.Schema<NextAiringEpisode> = Schema.Struct({
  episode: Schema.Number,
  airing_at: Schema.String,
});

export interface AnimeDiscoveryEntry {
  id: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  relation_type?: string;
  format?: string;
  status?: string;
  season?: AnimeSeason;
  season_year?: number;
  start_year?: number;
  cover_image?: string;
  rating?: number;
}

export const AnimeDiscoveryEntrySchema: Schema.Schema<AnimeDiscoveryEntry> = Schema.Struct({
  id: Schema.Number,
  title: Schema.Struct({
    romaji: Schema.optional(Schema.String),
    english: Schema.optional(Schema.String),
    native: Schema.optional(Schema.String),
  }),
  relation_type: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  season: Schema.optional(AnimeSeasonSchema),
  season_year: Schema.optional(Schema.Number),
  start_year: Schema.optional(Schema.Number),
  cover_image: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.Number),
});

export type EpisodeAiringStatus = "aired" | "future" | "unknown";

export const EpisodeAiringStatusSchema: Schema.Schema<EpisodeAiringStatus> = Schema.Literal(
  "aired",
  "future",
  "unknown",
);

export interface Anime {
  id: number;
  mal_id?: number;
  title: {
    romaji: string;
    english?: string;
    native?: string;
  };
  format: string;
  description?: string;
  score?: number;
  genres?: string[];
  studios?: string[];
  cover_image?: string;
  banner_image?: string;
  status: string;
  episode_count?: number;
  start_date?: string;
  end_date?: string;
  start_year?: number;
  end_year?: number;
  synonyms?: string[];
  related_anime?: AnimeDiscoveryEntry[];
  recommended_anime?: AnimeDiscoveryEntry[];
  next_airing_episode?: NextAiringEpisode;
  season?: AnimeSeason;
  season_year?: number;
  profile_name: string;
  root_folder: string;
  added_at: string;
  monitored: boolean;
  release_profile_ids: number[];
  progress: EpisodeProgress;
}

export const AnimeSchema: Schema.Schema<Anime> = Schema.mutable(
  Schema.Struct({
    id: Schema.Number,
    mal_id: Schema.optional(Schema.Number),
    title: AnimeTitleSchema,
    format: Schema.String,
    description: Schema.optional(Schema.String),
    score: Schema.optional(Schema.Number),
    genres: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
    studios: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
    cover_image: Schema.optional(Schema.String),
    banner_image: Schema.optional(Schema.String),
    status: Schema.String,
    episode_count: Schema.optional(Schema.Number),
    start_date: Schema.optional(Schema.String),
    end_date: Schema.optional(Schema.String),
    start_year: Schema.optional(Schema.Number),
    end_year: Schema.optional(Schema.Number),
    synonyms: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
    related_anime: Schema.optional(Schema.mutable(Schema.Array(AnimeDiscoveryEntrySchema))),
    recommended_anime: Schema.optional(Schema.mutable(Schema.Array(AnimeDiscoveryEntrySchema))),
    next_airing_episode: Schema.optional(NextAiringEpisodeSchema),
    season: Schema.optional(AnimeSeasonSchema),
    season_year: Schema.optional(Schema.Number),
    profile_name: Schema.String,
    root_folder: Schema.String,
    added_at: Schema.String,
    monitored: Schema.Boolean,
    release_profile_ids: Schema.mutable(Schema.Array(Schema.Number)),
    progress: EpisodeProgressSchema,
  }),
);

export interface AnimeListQueryParams {
  limit?: number;
  offset?: number;
  monitored?: boolean;
}

export const AnimeListQueryParamsSchema: Schema.Schema<AnimeListQueryParams> = Schema.Struct({
  limit: Schema.optional(Schema.Number.pipe(Schema.between(1, 500))),
  offset: Schema.optional(Schema.Number.pipe(Schema.nonNegative())),
  monitored: Schema.optional(Schema.Boolean),
});

export interface AnimeListResponse {
  items: Anime[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export const AnimeListResponseSchema: Schema.Schema<AnimeListResponse> = Schema.Struct({
  items: Schema.mutable(Schema.Array(AnimeSchema)),
  total: Schema.Number,
  limit: Schema.Number,
  offset: Schema.Number,
  has_more: Schema.Boolean,
});

export interface Episode {
  number: number;
  title?: string;
  aired?: string;
  is_future?: boolean;
  airing_status?: EpisodeAiringStatus;
  downloaded: boolean;
  file_path?: string;
  file_size?: number;
  duration_seconds?: number;
  group?: string;
  resolution?: string;
  quality?: string;
  video_codec?: string;
  audio_codec?: string;
  audio_channels?: string;
}

export const EpisodeSchema: Schema.Schema<Episode> = Schema.Struct({
  number: Schema.Number,
  title: Schema.optional(Schema.String),
  aired: Schema.optional(Schema.String),
  is_future: Schema.optional(Schema.Boolean),
  airing_status: Schema.optional(EpisodeAiringStatusSchema),
  downloaded: Schema.Boolean,
  file_path: Schema.optional(Schema.String),
  file_size: Schema.optional(Schema.Number),
  duration_seconds: Schema.optional(Schema.Number),
  group: Schema.optional(Schema.String),
  resolution: Schema.optional(Schema.String),
  quality: Schema.optional(Schema.String),
  video_codec: Schema.optional(Schema.String),
  audio_codec: Schema.optional(Schema.String),
  audio_channels: Schema.optional(Schema.String),
});

export interface VideoFile {
  name: string;
  path: string;
  size: number;
  duration_seconds?: number;
  episode_number?: number;
  episode_numbers?: number[];
  coverage_summary?: string;
  source_identity?: ParsedEpisodeIdentity;
  episode_title?: string;
  air_date?: string;
  group?: string;
  resolution?: string;
  quality?: string;
  video_codec?: string;
  audio_codec?: string;
  audio_channels?: string;
}

export const VideoFileSchema: Schema.Schema<VideoFile> = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  size: Schema.Number,
  duration_seconds: Schema.optional(Schema.Number),
  episode_number: Schema.optional(Schema.Number),
  episode_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  coverage_summary: Schema.optional(Schema.String),
  source_identity: Schema.optional(Schema.suspend(() => ParsedEpisodeIdentitySchema)),
  episode_title: Schema.optional(Schema.String),
  air_date: Schema.optional(Schema.String),
  group: Schema.optional(Schema.String),
  resolution: Schema.optional(Schema.String),
  quality: Schema.optional(Schema.String),
  video_codec: Schema.optional(Schema.String),
  audio_codec: Schema.optional(Schema.String),
  audio_channels: Schema.optional(Schema.String),
});

export interface RssFeed {
  id: number;
  anime_id: number;
  url: string;
  name?: string;
  last_checked?: string;
  enabled: boolean;
  created_at: string;
}

export const RssFeedSchema: Schema.Schema<RssFeed> = Schema.Struct({
  id: Schema.Number,
  anime_id: Schema.Number,
  url: Schema.String,
  name: Schema.optional(Schema.String),
  last_checked: Schema.optional(Schema.String),
  enabled: Schema.Boolean,
  created_at: Schema.String,
});

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  extended_props: {
    anime_id: number;
    anime_title: string;
    episode_number: number;
    episode_title?: string;
    airing_status?: EpisodeAiringStatus;
    downloaded: boolean;
    is_future?: boolean;
    anime_image?: string;
  };
}

export const CalendarEventExtendedPropsSchema: Schema.Schema<CalendarEvent["extended_props"]> =
  Schema.Struct({
    anime_id: Schema.Number,
    anime_title: Schema.String,
    episode_number: Schema.Number,
    episode_title: Schema.optional(Schema.String),
    airing_status: Schema.optional(EpisodeAiringStatusSchema),
    downloaded: Schema.Boolean,
    is_future: Schema.optional(Schema.Boolean),
    anime_image: Schema.optional(Schema.String),
  });

export const CalendarEventSchema: Schema.Schema<CalendarEvent> = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  start: Schema.String,
  end: Schema.String,
  all_day: Schema.Boolean,
  extended_props: CalendarEventExtendedPropsSchema,
});

export interface Download {
  id: number;
  anime_id: number;
  anime_title: string;
  anime_image?: string;
  episode_number: number;
  torrent_name: string;
  is_batch?: boolean;
  covered_episodes?: number[];
  coverage_pending?: boolean;
  decision_reason?: string;
  imported_path?: string;
  status?: string;
  progress?: number;
  added_at?: string;
  download_date?: string;
  group_name?: string;
  external_state?: string;
  error_message?: string;
  save_path?: string;
  content_path?: string;
  total_bytes?: number;
  downloaded_bytes?: number;
  speed_bytes?: number;
  eta_seconds?: number;
  last_synced_at?: string;
  retry_count?: number;
  last_error_at?: string;
  reconciled_at?: string;
  source_metadata?: DownloadSourceMetadata;
}

export const DownloadSchema: Schema.Schema<Download> = Schema.mutable(
  Schema.Struct({
    id: Schema.Number,
    anime_id: Schema.Number,
    anime_title: Schema.String,
    anime_image: Schema.optional(Schema.String),
    episode_number: Schema.Number,
    torrent_name: Schema.String,
    is_batch: Schema.optional(Schema.Boolean),
    covered_episodes: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
    coverage_pending: Schema.optional(Schema.Boolean),
    decision_reason: Schema.optional(Schema.String),
    imported_path: Schema.optional(Schema.String),
    status: Schema.optional(Schema.String),
    progress: Schema.optional(Schema.Number),
    added_at: Schema.optional(Schema.String),
    download_date: Schema.optional(Schema.String),
    group_name: Schema.optional(Schema.String),
    external_state: Schema.optional(Schema.String),
    error_message: Schema.optional(Schema.String),
    save_path: Schema.optional(Schema.String),
    content_path: Schema.optional(Schema.String),
    total_bytes: Schema.optional(Schema.Number),
    downloaded_bytes: Schema.optional(Schema.Number),
    speed_bytes: Schema.optional(Schema.Number),
    eta_seconds: Schema.optional(Schema.Number),
    last_synced_at: Schema.optional(Schema.String),
    retry_count: Schema.optional(Schema.Number),
    last_error_at: Schema.optional(Schema.String),
    reconciled_at: Schema.optional(Schema.String),
    source_metadata: Schema.optional(Schema.suspend(() => DownloadSourceMetadataSchema)),
  }),
);

export interface LibraryRoot {
  id: number;
  label: string;
  path: string;
}

export const LibraryRootSchema: Schema.Schema<LibraryRoot> = Schema.Struct({
  id: Schema.Number,
  label: Schema.String,
  path: Schema.String,
});

export interface LibraryStats {
  total_anime: number;
  monitored_anime: number;
  up_to_date_anime: number;
  total_episodes: number;
  downloaded_episodes: number;
  downloaded_percent: number;
  missing_episodes: number;
  rss_feeds: number;
  recent_downloads: number;
}

export const LibraryStatsSchema: Schema.Schema<LibraryStats> = Schema.Struct({
  total_anime: Schema.Number,
  monitored_anime: Schema.Number,
  up_to_date_anime: Schema.Number,
  total_episodes: Schema.Number,
  downloaded_episodes: Schema.Number,
  downloaded_percent: Schema.Number,
  missing_episodes: Schema.Number,
  rss_feeds: Schema.Number,
  recent_downloads: Schema.Number,
});

export interface ActivityItem {
  id: number;
  activity_type: string;
  anime_id: number;
  anime_title: string;
  episode_number?: number;
  description: string;
  timestamp: string;
}

export const ActivityItemSchema: Schema.Schema<ActivityItem> = Schema.Struct({
  id: Schema.Number,
  activity_type: Schema.String,
  anime_id: Schema.Number,
  anime_title: Schema.String,
  episode_number: Schema.optional(Schema.Number),
  description: Schema.String,
  timestamp: Schema.String,
});

export interface SystemStatus {
  version: string;
  uptime: number;
  active_torrents: number;
  pending_downloads: number;
  disk_space: {
    free: number;
    total: number;
  };
  last_scan?: string | null;
  last_rss?: string | null;
  last_metadata_refresh?: string | null;
}

export const DiskSpaceSchema: Schema.Schema<SystemStatus["disk_space"]> = Schema.Struct({
  free: Schema.Number,
  total: Schema.Number,
});

export const SystemStatusSchema: Schema.Schema<SystemStatus> = Schema.Struct({
  version: Schema.String,
  uptime: Schema.Number,
  active_torrents: Schema.Number,
  pending_downloads: Schema.Number,
  disk_space: DiskSpaceSchema,
  last_scan: Schema.optional(Schema.NullOr(Schema.String)),
  last_rss: Schema.optional(Schema.NullOr(Schema.String)),
  last_metadata_refresh: Schema.optional(Schema.NullOr(Schema.String)),
});

export interface Quality {
  id: number;
  name: string;
  source: string;
  resolution: number;
  rank: number;
}

export const QualitySchema: Schema.Schema<Quality> = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  source: Schema.String,
  resolution: Schema.Number,
  rank: Schema.Number,
});

export const QualityProfileSchema: Schema.Schema<{
  cutoff: string;
  upgrade_allowed: boolean;
  seadex_preferred: boolean;
  allowed_qualities: string[];
  name: string;
  min_size?: string | null;
  max_size?: string | null;
}> = Schema.mutable(
  Schema.Struct({
    cutoff: Schema.String,
    upgrade_allowed: Schema.Boolean,
    seadex_preferred: Schema.Boolean,
    allowed_qualities: Schema.mutable(Schema.Array(Schema.String)),
    name: Schema.String,
    min_size: Schema.optional(Schema.NullOr(Schema.String)),
    max_size: Schema.optional(Schema.NullOr(Schema.String)),
  }),
);

export type QualityProfile = Schema.Schema.Type<typeof QualityProfileSchema>;

export const ReleaseProfileRuleSchema: Schema.Schema<{
  term: string;
  score: number;
  rule_type: RuleType;
}> = Schema.Struct({
  term: Schema.String,
  score: Schema.Number,
  rule_type: RuleTypeSchema,
});

export type ReleaseProfileRule = Schema.Schema.Type<typeof ReleaseProfileRuleSchema>;

export const ReleaseProfileSchema: Schema.Schema<{
  id: number;
  name: string;
  enabled: boolean;
  is_global: boolean;
  rules: Array<Schema.Schema.Type<typeof ReleaseProfileRuleSchema>>;
}> = Schema.mutable(
  Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    enabled: Schema.Boolean,
    is_global: Schema.Boolean,
    rules: Schema.mutable(Schema.Array(ReleaseProfileRuleSchema)),
  }),
);

export type ReleaseProfile = Schema.Schema.Type<typeof ReleaseProfileSchema>;

export const StringListSchema: Schema.Schema<string[]> = Schema.mutable(
  Schema.Array(Schema.String),
);

export const RemotePathMappingSchema: Schema.Schema<string[]> = Schema.mutable(
  Schema.Array(Schema.String).pipe(Schema.itemsCount(2)),
);

export const GeneralConfigSchema: Schema.Schema<{
  database_path: string;
  log_level: string;
  images_path: string;
  suppress_connection_errors: boolean;
  worker_threads: number;
  max_db_connections: number;
  min_db_connections: number;
}> = Schema.Struct({
  database_path: Schema.String,
  log_level: Schema.String,
  images_path: Schema.String,
  suppress_connection_errors: Schema.Boolean,
  worker_threads: Schema.Number,
  max_db_connections: Schema.Number,
  min_db_connections: Schema.Number,
});

export const QbittorrentConfigSchema: Schema.Schema<{
  enabled: boolean;
  url: string;
  username: string;
  password?: string | null;
  default_category: string;
  trusted_local?: boolean;
}> = Schema.Struct({
  enabled: Schema.Boolean,
  url: Schema.String,
  username: Schema.String,
  password: Schema.optional(Schema.NullOr(Schema.String)),
  default_category: Schema.String,
  trusted_local: Schema.optional(Schema.Boolean),
});

export const NyaaConfigSchema: Schema.Schema<{
  base_url: string;
  default_category: string;
  filter_remakes: boolean;
  preferred_resolution?: string | null;
  min_seeders: number;
}> = Schema.Struct({
  base_url: Schema.String,
  default_category: Schema.String,
  filter_remakes: Schema.Boolean,
  preferred_resolution: Schema.optional(Schema.NullOr(Schema.String)),
  min_seeders: Schema.Number,
});

export const SchedulerConfigSchema: Schema.Schema<{
  enabled: boolean;
  check_interval_minutes: number;
  cron_expression?: string | null;
  max_concurrent_checks: number;
  check_delay_seconds: number;
  metadata_refresh_hours: number;
}> = Schema.Struct({
  enabled: Schema.Boolean,
  check_interval_minutes: Schema.Number,
  cron_expression: Schema.optional(Schema.NullOr(Schema.String)),
  max_concurrent_checks: Schema.Number,
  check_delay_seconds: Schema.Number,
  metadata_refresh_hours: Schema.Number,
});

export const DownloadsConfigSchema: Schema.Schema<{
  root_path: string;
  create_anime_folders: boolean;
  preferred_groups: string[];
  use_seadex: boolean;
  prefer_dual_audio: boolean;
  preferred_codec?: string | null;
  max_size_gb: number;
  remote_path_mappings: string[][];
  reconcile_completed_downloads?: boolean;
  remove_torrent_on_import?: boolean;
  delete_download_files_after_import?: boolean;
}> = Schema.mutable(
  Schema.Struct({
    root_path: Schema.String,
    create_anime_folders: Schema.Boolean,
    preferred_groups: StringListSchema,
    use_seadex: Schema.Boolean,
    prefer_dual_audio: Schema.Boolean,
    preferred_codec: Schema.optional(Schema.NullOr(Schema.String)),
    max_size_gb: Schema.Number,
    remote_path_mappings: Schema.mutable(Schema.Array(RemotePathMappingSchema)),
    reconcile_completed_downloads: Schema.optional(Schema.Boolean),
    remove_torrent_on_import: Schema.optional(Schema.Boolean),
    delete_download_files_after_import: Schema.optional(Schema.Boolean),
  }),
);

export const LibraryConfigSchema: Schema.Schema<{
  library_path: string;
  recycle_path: string;
  recycle_cleanup_days: number;
  naming_format: string;
  import_mode: ImportMode;
  movie_naming_format: string;
  auto_scan_interval_hours: number;
  preferred_title: PreferredTitle;
  airing_timezone?: string;
  airing_day_start_hour?: number;
}> = Schema.Struct({
  library_path: Schema.String,
  recycle_path: Schema.String,
  recycle_cleanup_days: Schema.Number,
  naming_format: Schema.String,
  import_mode: ImportModeSchema,
  movie_naming_format: Schema.String,
  auto_scan_interval_hours: Schema.Number,
  preferred_title: PreferredTitleSchema,
  airing_timezone: Schema.optional(Schema.String),
  airing_day_start_hour: Schema.optional(Schema.Number),
});

export const ConfigSchema: Schema.Schema<{
  general: Schema.Schema.Type<typeof GeneralConfigSchema>;
  qbittorrent: Schema.Schema.Type<typeof QbittorrentConfigSchema>;
  nyaa: Schema.Schema.Type<typeof NyaaConfigSchema>;
  scheduler: Schema.Schema.Type<typeof SchedulerConfigSchema>;
  downloads: Schema.Schema.Type<typeof DownloadsConfigSchema>;
  library: Schema.Schema.Type<typeof LibraryConfigSchema>;
  profiles: Array<Schema.Schema.Type<typeof QualityProfileSchema>>;
}> = Schema.mutable(
  Schema.Struct({
    general: GeneralConfigSchema,
    qbittorrent: QbittorrentConfigSchema,
    nyaa: NyaaConfigSchema,
    scheduler: SchedulerConfigSchema,
    downloads: DownloadsConfigSchema,
    library: LibraryConfigSchema,
    profiles: Schema.mutable(Schema.Array(Schema.suspend(() => QualityProfileSchema))),
  }),
);

export type Config = Schema.Schema.Type<typeof ConfigSchema>;

export interface SystemLog {
  id: number;
  event_type: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  details?: string;
  created_at: string;
}

export const SYSTEM_LOG_LEVEL_VALUES = ["info", "warn", "error", "success"] as const;
export type SystemLogLevel = (typeof SYSTEM_LOG_LEVEL_VALUES)[number];
export const SystemLogLevelSchema: Schema.Schema<SystemLogLevel> = Schema.Literal(
  ...SYSTEM_LOG_LEVEL_VALUES,
);

export const SystemLogSchema: Schema.Schema<SystemLog> = Schema.Struct({
  id: Schema.Number,
  event_type: Schema.String,
  level: SystemLogLevelSchema,
  message: Schema.String,
  details: Schema.optional(Schema.String),
  created_at: Schema.String,
});

export interface SystemLogsResponse {
  logs: SystemLog[];
  total_pages: number;
}

export const SystemLogsResponseSchema: Schema.Schema<SystemLogsResponse> = Schema.mutable(
  Schema.Struct({
    logs: Schema.mutable(Schema.Array(SystemLogSchema)),
    total_pages: Schema.Number,
  }),
);

export interface BackgroundJobStatus {
  name: string;
  is_running: boolean;
  last_run_at?: string;
  last_success_at?: string;
  last_status?: string;
  last_message?: string;
  progress_current?: number;
  progress_total?: number;
  run_count: number;
  schedule_mode?: "cron" | "interval" | "manual" | "disabled";
  schedule_value?: string;
}

export const BACKGROUND_JOB_SCHEDULE_MODE_VALUES = [
  "cron",
  "interval",
  "manual",
  "disabled",
] as const;
export type BackgroundJobScheduleMode = (typeof BACKGROUND_JOB_SCHEDULE_MODE_VALUES)[number];
export const BackgroundJobScheduleModeSchema: Schema.Schema<BackgroundJobScheduleMode> =
  Schema.Literal(...BACKGROUND_JOB_SCHEDULE_MODE_VALUES);

export const BackgroundJobStatusSchema: Schema.Schema<BackgroundJobStatus> = Schema.Struct({
  name: Schema.String,
  is_running: Schema.Boolean,
  last_run_at: Schema.optional(Schema.String),
  last_success_at: Schema.optional(Schema.String),
  last_status: Schema.optional(Schema.String),
  last_message: Schema.optional(Schema.String),
  progress_current: Schema.optional(Schema.Number),
  progress_total: Schema.optional(Schema.Number),
  run_count: Schema.Number,
  schedule_mode: Schema.optional(BackgroundJobScheduleModeSchema),
  schedule_value: Schema.optional(Schema.String),
});

export interface DownloadEventMetadata {
  covered_episodes?: number[];
  imported_path?: string;
  source_metadata?: DownloadSourceMetadata;
}

export interface DownloadEvent {
  id: number;
  download_id?: number;
  anime_id?: number;
  anime_image?: string;
  anime_title?: string;
  event_type: string;
  from_status?: string;
  to_status?: string;
  message: string;
  metadata?: string;
  metadata_json?: DownloadEventMetadata;
  torrent_name?: string;
  created_at: string;
}

export const DownloadEventMetadataSchema: Schema.Schema<DownloadEventMetadata> = Schema.Struct({
  covered_episodes: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  imported_path: Schema.optional(Schema.String),
  source_metadata: Schema.optional(Schema.suspend(() => DownloadSourceMetadataSchema)),
});

export const DownloadEventSchema: Schema.Schema<DownloadEvent> = Schema.Struct({
  id: Schema.Number,
  download_id: Schema.optional(Schema.Number),
  anime_id: Schema.optional(Schema.Number),
  anime_image: Schema.optional(Schema.String),
  anime_title: Schema.optional(Schema.String),
  event_type: Schema.String,
  from_status: Schema.optional(Schema.String),
  to_status: Schema.optional(Schema.String),
  message: Schema.String,
  metadata: Schema.optional(Schema.String),
  metadata_json: Schema.optional(DownloadEventMetadataSchema),
  torrent_name: Schema.optional(Schema.String),
  created_at: Schema.String,
});

export interface DownloadEventsPage {
  events: DownloadEvent[];
  limit: number;
  total: number;
  has_more: boolean;
  next_cursor?: string;
  prev_cursor?: string;
}

export const DownloadEventsPageSchema: Schema.Schema<DownloadEventsPage> = Schema.Struct({
  events: Schema.mutable(Schema.Array(DownloadEventSchema)),
  limit: Schema.Number,
  total: Schema.Number,
  has_more: Schema.Boolean,
  next_cursor: Schema.optional(Schema.String),
  prev_cursor: Schema.optional(Schema.String),
});

export type DownloadEventsExportOrder = "asc" | "desc";

export const DownloadEventsExportOrderSchema: Schema.Schema<DownloadEventsExportOrder> =
  Schema.Literal("asc", "desc");

export interface DownloadEventsExport {
  events: DownloadEvent[];
  total: number;
  exported: number;
  truncated: boolean;
  limit: number;
  order: DownloadEventsExportOrder;
  generated_at: string;
}

export const DownloadEventsExportSchema: Schema.Schema<DownloadEventsExport> = Schema.Struct({
  events: Schema.mutable(Schema.Array(DownloadEventSchema)),
  total: Schema.Number,
  exported: Schema.Number,
  truncated: Schema.Boolean,
  limit: Schema.Number,
  order: DownloadEventsExportOrderSchema,
  generated_at: Schema.String,
});

export interface OpsDashboard {
  queued_downloads: number;
  active_downloads: number;
  failed_downloads: number;
  imported_downloads: number;
  running_jobs: number;
  recent_download_events: DownloadEvent[];
  jobs: BackgroundJobStatus[];
}

export const OpsDashboardSchema: Schema.Schema<OpsDashboard> = Schema.Struct({
  queued_downloads: Schema.Number,
  active_downloads: Schema.Number,
  failed_downloads: Schema.Number,
  imported_downloads: Schema.Number,
  running_jobs: Schema.Number,
  recent_download_events: Schema.mutable(Schema.Array(DownloadEventSchema)),
  jobs: Schema.mutable(Schema.Array(BackgroundJobStatusSchema)),
}).pipe(Schema.mutable);

export interface BrowseEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size?: number;
}

export const BrowseEntrySchema: Schema.Schema<BrowseEntry> = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  is_directory: Schema.Boolean,
  size: Schema.optional(Schema.Number),
});

export interface BrowseResult {
  current_path: string;
  parent_path?: string;
  entries: BrowseEntry[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export const BrowseResultSchema: Schema.Schema<BrowseResult> = Schema.mutable(
  Schema.Struct({
    current_path: Schema.String,
    parent_path: Schema.optional(Schema.String),
    entries: Schema.mutable(Schema.Array(BrowseEntrySchema)),
    total: Schema.Number,
    limit: Schema.Number,
    offset: Schema.Number,
    has_more: Schema.Boolean,
  }),
);

export interface MissingEpisode {
  anime_id: number;
  anime_title: string;
  episode_number: number;
  episode_title?: string;
  aired?: string;
  airing_status?: EpisodeAiringStatus;
  anime_image?: string;
  is_future?: boolean;
  next_airing_episode?: NextAiringEpisode;
}

export const MissingEpisodeSchema: Schema.Schema<MissingEpisode> = Schema.Struct({
  anime_id: Schema.Number,
  anime_title: Schema.String,
  episode_number: Schema.Number,
  episode_title: Schema.optional(Schema.String),
  aired: Schema.optional(Schema.String),
  airing_status: Schema.optional(EpisodeAiringStatusSchema),
  anime_image: Schema.optional(Schema.String),
  is_future: Schema.optional(Schema.Boolean),
  next_airing_episode: Schema.optional(NextAiringEpisodeSchema),
});

export type NamingTitleSource =
  | "preferred_english"
  | "preferred_native"
  | "preferred_romaji"
  | "fallback_english"
  | "fallback_native"
  | "fallback_romaji";

export const NamingTitleSourceSchema: Schema.Schema<NamingTitleSource> = Schema.Literal(
  "preferred_english",
  "preferred_native",
  "preferred_romaji",
  "fallback_english",
  "fallback_native",
  "fallback_romaji",
);

export interface RenamePreviewMetadataSnapshot {
  title: string;
  title_source?: NamingTitleSource;
  season?: number;
  year?: number;
  episode_title?: string;
  air_date?: string;
  group?: string;
  resolution?: string;
  quality?: string;
  video_codec?: string;
  audio_codec?: string;
  audio_channels?: string;
  source_identity?: ParsedEpisodeIdentity;
}

export const RenamePreviewMetadataSnapshotSchema: Schema.Schema<RenamePreviewMetadataSnapshot> =
  Schema.Struct({
    title: Schema.String,
    title_source: Schema.optional(NamingTitleSourceSchema),
    season: Schema.optional(Schema.Number),
    year: Schema.optional(Schema.Number),
    episode_title: Schema.optional(Schema.String),
    air_date: Schema.optional(Schema.String),
    group: Schema.optional(Schema.String),
    resolution: Schema.optional(Schema.String),
    quality: Schema.optional(Schema.String),
    video_codec: Schema.optional(Schema.String),
    audio_codec: Schema.optional(Schema.String),
    audio_channels: Schema.optional(Schema.String),
    source_identity: Schema.optional(Schema.suspend(() => ParsedEpisodeIdentitySchema)),
  });

export interface RenamePreviewItem {
  episode_number: number;
  episode_numbers?: number[];
  current_path: string;
  new_path: string;
  new_filename: string;
  format_used?: string;
  fallback_used?: boolean;
  warnings?: string[];
  missing_fields?: string[];
  metadata_snapshot?: RenamePreviewMetadataSnapshot;
}

export const RenamePreviewItemSchema: Schema.Schema<RenamePreviewItem> = Schema.Struct({
  episode_number: Schema.Number,
  episode_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  current_path: Schema.String,
  new_path: Schema.String,
  new_filename: Schema.String,
  format_used: Schema.optional(Schema.String),
  fallback_used: Schema.optional(Schema.Boolean),
  warnings: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  missing_fields: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  metadata_snapshot: Schema.optional(RenamePreviewMetadataSnapshotSchema),
});

export interface RenameResult {
  renamed: number;
  failed: number;
  failures: string[];
}

export const RenameResultSchema: Schema.Schema<RenameResult> = Schema.mutable(
  Schema.Struct({
    renamed: Schema.Number,
    failed: Schema.Number,
    failures: StringListSchema,
  }),
);

export interface ParsedEpisodeIdentity {
  scheme: "season" | "absolute" | "daily";
  season?: number;
  episode_numbers?: number[];
  air_dates?: string[];
  label: string;
}

export const ParsedEpisodeIdentitySchema: Schema.Schema<ParsedEpisodeIdentity> = Schema.Struct({
  scheme: Schema.Literal("season", "absolute", "daily"),
  season: Schema.optional(Schema.Number),
  episode_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  air_dates: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  label: Schema.String,
});

export type DownloadSelectionKind = "manual" | "accept" | "upgrade";

export const DownloadSelectionKindSchema: Schema.Schema<DownloadSelectionKind> = Schema.Literal(
  "manual",
  "accept",
  "upgrade",
);

export interface DownloadSourceMetadata {
  parsed_title?: string;
  source_identity?: ParsedEpisodeIdentity;
  decision_reason?: string;
  selection_kind?: DownloadSelectionKind;
  selection_score?: number;
  previous_quality?: string;
  previous_score?: number;
  chosen_from_seadex?: boolean;
  episode_title?: string;
  air_date?: string;
  group?: string;
  resolution?: string;
  quality?: string;
  video_codec?: string;
  audio_codec?: string;
  audio_channels?: string;
  trusted?: boolean;
  remake?: boolean;
  source_url?: string;
  indexer?: string;
  is_seadex?: boolean;
  is_seadex_best?: boolean;
  seadex_release_group?: string;
  seadex_tags?: string[];
  seadex_notes?: string;
  seadex_comparison?: string;
  seadex_dual_audio?: boolean;
}

export const DownloadSourceMetadataSchema: Schema.Schema<DownloadSourceMetadata> = Schema.Struct({
  parsed_title: Schema.optional(Schema.String),
  source_identity: Schema.optional(ParsedEpisodeIdentitySchema),
  decision_reason: Schema.optional(Schema.String),
  selection_kind: Schema.optional(DownloadSelectionKindSchema),
  selection_score: Schema.optional(Schema.Number),
  previous_quality: Schema.optional(Schema.String),
  previous_score: Schema.optional(Schema.Number),
  chosen_from_seadex: Schema.optional(Schema.Boolean),
  episode_title: Schema.optional(Schema.String),
  air_date: Schema.optional(Schema.String),
  group: Schema.optional(Schema.String),
  resolution: Schema.optional(Schema.String),
  quality: Schema.optional(Schema.String),
  video_codec: Schema.optional(Schema.String),
  audio_codec: Schema.optional(Schema.String),
  audio_channels: Schema.optional(Schema.String),
  trusted: Schema.optional(Schema.Boolean),
  remake: Schema.optional(Schema.Boolean),
  source_url: Schema.optional(Schema.String),
  indexer: Schema.optional(Schema.String),
  is_seadex: Schema.optional(Schema.Boolean),
  is_seadex_best: Schema.optional(Schema.Boolean),
  seadex_release_group: Schema.optional(Schema.String),
  seadex_tags: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  seadex_notes: Schema.optional(Schema.String),
  seadex_comparison: Schema.optional(Schema.String),
  seadex_dual_audio: Schema.optional(Schema.Boolean),
});

export interface FileEpisodeMapping {
  anime_id: number;
  anime_title: string;
  episode_numbers?: number[];
  file_path?: string;
}

export const FileEpisodeMappingSchema: Schema.Schema<FileEpisodeMapping> = Schema.Struct({
  anime_id: Schema.Number,
  anime_title: Schema.String,
  episode_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  file_path: Schema.optional(Schema.String),
});

export interface ScannedFile {
  source_path: string;
  filename: string;
  size?: number;
  parsed_title: string;
  episode_number: number;
  episode_numbers?: number[];
  coverage_summary?: string;
  episode_title?: string;
  air_date?: string;
  season?: number;
  group?: string;
  resolution?: string;
  quality?: string;
  video_codec?: string;
  audio_codec?: string;
  audio_channels?: string;
  duration_seconds?: number;
  matched_anime?: {
    id: number;
    title: string;
  };
  suggested_candidate_id?: number;
  match_confidence?: number;
  match_reason?: string;
  existing_mapping?: FileEpisodeMapping;
  episode_conflict?: FileEpisodeMapping;
  source_identity?: ParsedEpisodeIdentity;
  skip_reason?: string;
  needs_manual_mapping?: boolean;
  warnings?: string[];
  naming_filename?: string;
  naming_format_used?: string;
  naming_fallback_used?: boolean;
  naming_warnings?: string[];
  naming_missing_fields?: string[];
  naming_metadata_snapshot?: RenamePreviewMetadataSnapshot;
}

export const ScannedFileMatchedAnimeSchema: Schema.Schema<
  NonNullable<ScannedFile["matched_anime"]>
> = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
});

export const ScannedFileSchema: Schema.Schema<ScannedFile> = Schema.Struct({
  source_path: Schema.String,
  filename: Schema.String,
  size: Schema.optional(Schema.Number),
  parsed_title: Schema.String,
  episode_number: Schema.Number,
  episode_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  coverage_summary: Schema.optional(Schema.String),
  episode_title: Schema.optional(Schema.String),
  air_date: Schema.optional(Schema.String),
  season: Schema.optional(Schema.Number),
  group: Schema.optional(Schema.String),
  resolution: Schema.optional(Schema.String),
  quality: Schema.optional(Schema.String),
  video_codec: Schema.optional(Schema.String),
  audio_codec: Schema.optional(Schema.String),
  audio_channels: Schema.optional(Schema.String),
  duration_seconds: Schema.optional(Schema.Number),
  matched_anime: Schema.optional(ScannedFileMatchedAnimeSchema),
  suggested_candidate_id: Schema.optional(Schema.Number),
  match_confidence: Schema.optional(Schema.Number),
  match_reason: Schema.optional(Schema.String),
  existing_mapping: Schema.optional(FileEpisodeMappingSchema),
  episode_conflict: Schema.optional(FileEpisodeMappingSchema),
  source_identity: Schema.optional(ParsedEpisodeIdentitySchema),
  skip_reason: Schema.optional(Schema.String),
  needs_manual_mapping: Schema.optional(Schema.Boolean),
  warnings: Schema.optional(StringListSchema),
  naming_filename: Schema.optional(Schema.String),
  naming_format_used: Schema.optional(Schema.String),
  naming_fallback_used: Schema.optional(Schema.Boolean),
  naming_warnings: Schema.optional(StringListSchema),
  naming_missing_fields: Schema.optional(StringListSchema),
  naming_metadata_snapshot: Schema.optional(RenamePreviewMetadataSnapshotSchema),
});

export interface SkippedFile {
  path: string;
  reason: string;
}

export const SkippedFileSchema: Schema.Schema<SkippedFile> = Schema.Struct({
  path: Schema.String,
  reason: Schema.String,
});

export interface ScanResult {
  files: ScannedFile[];
  skipped: SkippedFile[];
  candidates: AnimeSearchResult[];
}

export const ScanResultSchema: Schema.Schema<ScanResult> = Schema.mutable(
  Schema.Struct({
    files: Schema.mutable(Schema.Array(ScannedFileSchema)),
    skipped: Schema.mutable(Schema.Array(SkippedFileSchema)),
    candidates: Schema.mutable(Schema.Array(Schema.suspend(() => AnimeSearchResultSchema))),
  }),
);

export interface ImportedFile {
  source_path: string;
  destination_path: string;
  anime_id: number;
  episode_number: number;
  episode_numbers?: number[];
  naming_format_used?: string;
  naming_fallback_used?: boolean;
  naming_warnings?: string[];
  naming_missing_fields?: string[];
  naming_metadata_snapshot?: RenamePreviewMetadataSnapshot;
}

export const ImportedFileSchema: Schema.Schema<ImportedFile> = Schema.Struct({
  source_path: Schema.String,
  destination_path: Schema.String,
  anime_id: Schema.Number,
  episode_number: Schema.Number,
  episode_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  naming_format_used: Schema.optional(Schema.String),
  naming_fallback_used: Schema.optional(Schema.Boolean),
  naming_warnings: Schema.optional(StringListSchema),
  naming_missing_fields: Schema.optional(StringListSchema),
  naming_metadata_snapshot: Schema.optional(RenamePreviewMetadataSnapshotSchema),
});

export interface FailedImport {
  source_path: string;
  error: string;
}

export const FailedImportSchema: Schema.Schema<FailedImport> = Schema.Struct({
  source_path: Schema.String,
  error: Schema.String,
});

export interface ImportResult {
  imported: number;
  failed: number;
  imported_files: ImportedFile[];
  failed_files: FailedImport[];
}

export const ImportResultSchema: Schema.Schema<ImportResult> = Schema.mutable(
  Schema.Struct({
    imported: Schema.Number,
    failed: Schema.Number,
    imported_files: Schema.mutable(Schema.Array(ImportedFileSchema)),
    failed_files: Schema.mutable(Schema.Array(FailedImportSchema)),
  }),
);

export interface DownloadAction {
  Accept?: {
    quality: Quality;
    is_seadex: boolean;
    is_seadex_best?: boolean;
    score: number;
  };
  Upgrade?: {
    quality: Quality;
    is_seadex: boolean;
    is_seadex_best?: boolean;
    score: number;
    reason: string;
    old_file_path?: string;
    old_quality: Quality;
    old_score?: number;
  };
  Reject?: { reason: string };
}

export const DownloadActionAcceptSchema: Schema.Schema<NonNullable<DownloadAction["Accept"]>> =
  Schema.Struct({
    quality: QualitySchema,
    is_seadex: Schema.Boolean,
    is_seadex_best: Schema.optional(Schema.Boolean),
    score: Schema.Number,
  });

export const DownloadActionUpgradeSchema: Schema.Schema<NonNullable<DownloadAction["Upgrade"]>> =
  Schema.Struct({
    quality: QualitySchema,
    is_seadex: Schema.Boolean,
    is_seadex_best: Schema.optional(Schema.Boolean),
    score: Schema.Number,
    reason: Schema.String,
    old_file_path: Schema.optional(Schema.String),
    old_quality: QualitySchema,
    old_score: Schema.optional(Schema.Number),
  });

export const DownloadActionRejectSchema: Schema.Schema<NonNullable<DownloadAction["Reject"]>> =
  Schema.Struct({
    reason: Schema.String,
  });

export const DownloadActionSchema: Schema.Schema<DownloadAction> = Schema.Struct({
  Accept: Schema.optional(DownloadActionAcceptSchema),
  Upgrade: Schema.optional(DownloadActionUpgradeSchema),
  Reject: Schema.optional(DownloadActionRejectSchema),
});

export interface NyaaSearchResult {
  title: string;
  indexer: string;
  magnet: string;
  info_hash: string;
  size: string;
  seeders: number;
  leechers: number;
  pub_date: string;
  view_url: string;
  parsed_episode?: string;
  parsed_group?: string;
  parsed_quality?: string;
  parsed_resolution?: string;
  parsed_episode_label?: string;
  parsed_episode_numbers?: number[];
  parsed_air_date?: string;
  trusted: boolean;
  is_seadex: boolean;
  is_seadex_best: boolean;
  seadex_release_group?: string;
  seadex_tags?: string[];
  seadex_notes?: string;
  seadex_comparison?: string;
  seadex_dual_audio?: boolean;
  remake: boolean;
}

export const NyaaSearchResultSchema: Schema.Schema<NyaaSearchResult> = Schema.Struct({
  title: Schema.String,
  indexer: Schema.String,
  magnet: Schema.String,
  info_hash: Schema.String,
  size: Schema.String,
  seeders: Schema.Number,
  leechers: Schema.Number,
  pub_date: Schema.String,
  view_url: Schema.String,
  parsed_episode: Schema.optional(Schema.String),
  parsed_group: Schema.optional(Schema.String),
  parsed_quality: Schema.optional(Schema.String),
  parsed_resolution: Schema.optional(Schema.String),
  parsed_episode_label: Schema.optional(Schema.String),
  parsed_episode_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  parsed_air_date: Schema.optional(Schema.String),
  trusted: Schema.Boolean,
  is_seadex: Schema.Boolean,
  is_seadex_best: Schema.Boolean,
  seadex_release_group: Schema.optional(Schema.String),
  seadex_tags: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  seadex_notes: Schema.optional(Schema.String),
  seadex_comparison: Schema.optional(Schema.String),
  seadex_dual_audio: Schema.optional(Schema.Boolean),
  remake: Schema.Boolean,
});

export interface EpisodeSearchResult {
  title: string;
  indexer: string;
  link: string;
  info_hash: string;
  size: number;
  seeders: number;
  leechers: number;
  publish_date: string;
  download_action: DownloadAction;
  quality: string;
  group?: string;
  parsed_resolution?: string;
  parsed_episode_label?: string;
  parsed_episode_numbers?: number[];
  parsed_air_date?: string;
  trusted?: boolean;
  remake?: boolean;
  view_url?: string;
  is_seadex?: boolean;
  is_seadex_best?: boolean;
  seadex_release_group?: string;
  seadex_comparison?: string;
  seadex_dual_audio?: boolean;
  seadex_tags?: string[];
  seadex_notes?: string;
}

export const EpisodeSearchResultSchema: Schema.Schema<EpisodeSearchResult> = Schema.Struct({
  title: Schema.String,
  indexer: Schema.String,
  link: Schema.String,
  info_hash: Schema.String,
  size: Schema.Number,
  seeders: Schema.Number,
  leechers: Schema.Number,
  publish_date: Schema.String,
  download_action: DownloadActionSchema,
  quality: Schema.String,
  group: Schema.optional(Schema.String),
  parsed_resolution: Schema.optional(Schema.String),
  parsed_episode_label: Schema.optional(Schema.String),
  parsed_episode_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  parsed_air_date: Schema.optional(Schema.String),
  trusted: Schema.optional(Schema.Boolean),
  remake: Schema.optional(Schema.Boolean),
  view_url: Schema.optional(Schema.String),
  is_seadex: Schema.optional(Schema.Boolean),
  is_seadex_best: Schema.optional(Schema.Boolean),
  seadex_release_group: Schema.optional(Schema.String),
  seadex_comparison: Schema.optional(Schema.String),
  seadex_dual_audio: Schema.optional(Schema.Boolean),
  seadex_tags: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  seadex_notes: Schema.optional(Schema.String),
});

export interface SearchResults {
  results: NyaaSearchResult[];
  seadex_groups: string[];
}

export const SearchResultsSchema: Schema.Schema<SearchResults> = Schema.mutable(
  Schema.Struct({
    results: Schema.mutable(Schema.Array(NyaaSearchResultSchema)),
    seadex_groups: StringListSchema,
  }),
);

export interface AnimeSearchResult {
  id: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  format?: string;
  episode_count?: number;
  status?: string;
  start_date?: string;
  end_date?: string;
  start_year?: number;
  end_year?: number;
  season?: AnimeSeason;
  season_year?: number;
  cover_image?: string;
  banner_image?: string;
  description?: string;
  genres?: string[];
  synonyms?: string[];
  related_anime?: AnimeDiscoveryEntry[];
  recommended_anime?: AnimeDiscoveryEntry[];
  match_confidence?: number;
  match_reason?: string;
  already_in_library?: boolean;
}

export const AnimeSearchResultTitleSchema: Schema.Schema<AnimeSearchResult["title"]> =
  Schema.Struct({
    romaji: Schema.optional(Schema.String),
    english: Schema.optional(Schema.String),
    native: Schema.optional(Schema.String),
  });

export const AnimeSearchResultSchema: Schema.Schema<AnimeSearchResult> = Schema.Struct({
  id: Schema.Number,
  title: AnimeSearchResultTitleSchema,
  format: Schema.optional(Schema.String),
  episode_count: Schema.optional(Schema.Number),
  status: Schema.optional(Schema.String),
  start_date: Schema.optional(Schema.String),
  end_date: Schema.optional(Schema.String),
  start_year: Schema.optional(Schema.Number),
  end_year: Schema.optional(Schema.Number),
  season: Schema.optional(AnimeSeasonSchema),
  season_year: Schema.optional(Schema.Number),
  cover_image: Schema.optional(Schema.String),
  banner_image: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  genres: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  synonyms: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  related_anime: Schema.optional(Schema.mutable(Schema.Array(AnimeDiscoveryEntrySchema))),
  recommended_anime: Schema.optional(Schema.mutable(Schema.Array(AnimeDiscoveryEntrySchema))),
  match_confidence: Schema.optional(Schema.Number),
  match_reason: Schema.optional(Schema.String),
  already_in_library: Schema.optional(Schema.Boolean),
});

export interface AnimeSearchResponse {
  results: AnimeSearchResult[];
  degraded: boolean;
}

export const AnimeSearchResponseSchema: Schema.Schema<AnimeSearchResponse> = Schema.mutable(
  Schema.Struct({
    degraded: Schema.Boolean,
    results: Schema.mutable(Schema.Array(AnimeSearchResultSchema)),
  }),
);

export const UNMAPPED_FOLDER_MATCH_STATUS_VALUES = [
  "pending",
  "matching",
  "paused",
  "done",
  "failed",
] as const;

export type UnmappedFolderMatchStatus = (typeof UNMAPPED_FOLDER_MATCH_STATUS_VALUES)[number];

export const UnmappedFolderMatchStatusSchema: Schema.Schema<UnmappedFolderMatchStatus> =
  Schema.Literal(...UNMAPPED_FOLDER_MATCH_STATUS_VALUES);

export const MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS = 3;

export interface UnmappedFolder {
  match_attempts?: number;
  last_match_error?: string;
  last_matched_at?: string;
  match_status?: UnmappedFolderMatchStatus;
  name: string;
  path: string;
  search_queries?: string[];
  size: number;
  suggested_matches: AnimeSearchResult[];
}

export const UnmappedFolderSchema: Schema.Schema<UnmappedFolder> = Schema.mutable(
  Schema.Struct({
    match_attempts: Schema.optional(Schema.Number),
    last_match_error: Schema.optional(Schema.String),
    last_matched_at: Schema.optional(Schema.String),
    match_status: Schema.optional(UnmappedFolderMatchStatusSchema),
    name: Schema.String,
    path: Schema.String,
    search_queries: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
    size: Schema.Number,
    suggested_matches: Schema.mutable(Schema.Array(AnimeSearchResultSchema)),
  }),
);

export interface ScannerState {
  has_outstanding_matches: boolean;
  is_scanning: boolean;
  folders: UnmappedFolder[];
  last_updated?: string;
}

export const ScannerStateSchema: Schema.Schema<ScannerState> = Schema.mutable(
  Schema.Struct({
    has_outstanding_matches: Schema.Boolean,
    is_scanning: Schema.Boolean,
    folders: Schema.mutable(Schema.Array(UnmappedFolderSchema)),
    last_updated: Schema.optional(Schema.String),
  }),
);

export interface DownloadStatus {
  anime_id?: number;
  anime_title?: string;
  id?: number;
  episode_number?: number;
  anime_image?: string;
  decision_reason?: string;
  hash: string;
  imported_path?: string;
  name: string;
  progress: number;
  speed: number;
  eta: number;
  state: string;
  total_bytes: number;
  downloaded_bytes: number;
  is_batch?: boolean;
  covered_episodes?: number[];
  coverage_pending?: boolean;
  source_metadata?: DownloadSourceMetadata;
}

export const DownloadStatusSchema: Schema.Schema<DownloadStatus> = Schema.Struct({
  anime_id: Schema.optional(Schema.Number),
  anime_title: Schema.optional(Schema.String),
  id: Schema.optional(Schema.Number),
  episode_number: Schema.optional(Schema.Number),
  anime_image: Schema.optional(Schema.String),
  decision_reason: Schema.optional(Schema.String),
  hash: Schema.String,
  imported_path: Schema.optional(Schema.String),
  name: Schema.String,
  progress: Schema.Number,
  speed: Schema.Number,
  eta: Schema.Number,
  state: Schema.String,
  total_bytes: Schema.Number,
  downloaded_bytes: Schema.Number,
  is_batch: Schema.optional(Schema.Boolean),
  covered_episodes: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  coverage_pending: Schema.optional(Schema.Boolean),
  source_metadata: Schema.optional(Schema.suspend(() => DownloadSourceMetadataSchema)),
});

export type NotificationEvent =
  | { type: "ScanStarted" }
  | { type: "ScanFinished" }
  | { type: "ScanProgress"; payload: { current: number; total: number } }
  | {
      type: "DownloadStarted";
      payload: {
        title: string;
        anime_id?: number;
        source_metadata?: DownloadSourceMetadata;
      };
    }
  | {
      type: "DownloadFinished";
      payload: {
        title: string;
        anime_id?: number;
        imported_path?: string;
        source_metadata?: DownloadSourceMetadata;
      };
    }
  | { type: "RefreshStarted"; payload: { anime_id: number; title: string } }
  | { type: "RefreshFinished"; payload: { anime_id: number; title: string } }
  | {
      type: "SearchMissingStarted";
      payload: { anime_id: number; title: string };
    }
  | {
      type: "SearchMissingFinished";
      payload: { anime_id: number; title: string; count: number };
    }
  | { type: "ScanFolderStarted"; payload: { anime_id: number; title: string } }
  | {
      type: "ScanFolderFinished";
      payload: { anime_id: number; title: string; found: number };
    }
  | { type: "RenameStarted"; payload: { anime_id: number; title: string } }
  | {
      type: "RenameFinished";
      payload: { anime_id: number; title: string; count: number };
    }
  | { type: "ImportStarted"; payload: { count: number } }
  | {
      type: "ImportFinished";
      payload: { count: number; imported: number; failed: number };
    }
  | { type: "LibraryScanStarted" }
  | {
      type: "LibraryScanFinished";
      payload: { scanned: number; matched: number; updated?: number };
    }
  | { type: "LibraryScanProgress"; payload: { scanned: number } }
  | { type: "RssCheckStarted" }
  | {
      type: "RssCheckFinished";
      payload: { total_feeds?: number; new_items: number };
    }
  | {
      type: "RssCheckProgress";
      payload: { current: number; total: number; feed_name: string };
    }
  | { type: "Error"; payload: { message: string } }
  | { type: "Info"; payload: { message: string } }
  | { type: "DownloadProgress"; payload: { downloads: DownloadStatus[] } }
  | { type: "SystemStatus"; payload: SystemStatus };

export const NotificationEventSchema: Schema.Schema<NotificationEvent> = Schema.mutable(
  Schema.Union(
    Schema.Struct({ type: Schema.Literal("ScanStarted") }),
    Schema.Struct({ type: Schema.Literal("ScanFinished") }),
    Schema.Struct({
      type: Schema.Literal("ScanProgress"),
      payload: Schema.Struct({
        current: Schema.Number,
        total: Schema.Number,
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("DownloadStarted"),
      payload: Schema.Struct({
        title: Schema.String,
        anime_id: Schema.optional(Schema.Number),
        source_metadata: Schema.optional(Schema.suspend(() => DownloadSourceMetadataSchema)),
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("DownloadFinished"),
      payload: Schema.Struct({
        title: Schema.String,
        anime_id: Schema.optional(Schema.Number),
        imported_path: Schema.optional(Schema.String),
        source_metadata: Schema.optional(Schema.suspend(() => DownloadSourceMetadataSchema)),
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("RefreshStarted"),
      payload: Schema.Struct({
        anime_id: Schema.Number,
        title: Schema.String,
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("RefreshFinished"),
      payload: Schema.Struct({
        anime_id: Schema.Number,
        title: Schema.String,
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("SearchMissingStarted"),
      payload: Schema.Struct({
        anime_id: Schema.Number,
        title: Schema.String,
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("SearchMissingFinished"),
      payload: Schema.Struct({
        anime_id: Schema.Number,
        title: Schema.String,
        count: Schema.Number,
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("ScanFolderStarted"),
      payload: Schema.Struct({
        anime_id: Schema.Number,
        title: Schema.String,
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("ScanFolderFinished"),
      payload: Schema.Struct({
        anime_id: Schema.Number,
        title: Schema.String,
        found: Schema.Number,
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("RenameStarted"),
      payload: Schema.Struct({
        anime_id: Schema.Number,
        title: Schema.String,
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("RenameFinished"),
      payload: Schema.Struct({
        anime_id: Schema.Number,
        title: Schema.String,
        count: Schema.Number,
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("ImportStarted"),
      payload: Schema.Struct({ count: Schema.Number }),
    }),
    Schema.Struct({
      type: Schema.Literal("ImportFinished"),
      payload: Schema.Struct({
        count: Schema.Number,
        imported: Schema.Number,
        failed: Schema.Number,
      }),
    }),
    Schema.Struct({ type: Schema.Literal("LibraryScanStarted") }),
    Schema.Struct({
      type: Schema.Literal("LibraryScanFinished"),
      payload: Schema.Struct({
        scanned: Schema.Number,
        matched: Schema.Number,
        updated: Schema.optional(Schema.Number),
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("LibraryScanProgress"),
      payload: Schema.Struct({ scanned: Schema.Number }),
    }),
    Schema.Struct({ type: Schema.Literal("RssCheckStarted") }),
    Schema.Struct({
      type: Schema.Literal("RssCheckFinished"),
      payload: Schema.Struct({
        total_feeds: Schema.optional(Schema.Number),
        new_items: Schema.Number,
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("RssCheckProgress"),
      payload: Schema.Struct({
        current: Schema.Number,
        total: Schema.Number,
        feed_name: Schema.String,
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("Error"),
      payload: Schema.Struct({ message: Schema.String }),
    }),
    Schema.Struct({
      type: Schema.Literal("Info"),
      payload: Schema.Struct({ message: Schema.String }),
    }),
    Schema.Struct({
      type: Schema.Literal("DownloadProgress"),
      payload: Schema.Struct({
        downloads: Schema.mutable(Schema.Array(DownloadStatusSchema)),
      }),
    }),
    Schema.Struct({
      type: Schema.Literal("SystemStatus"),
      payload: SystemStatusSchema,
    }),
  ),
);
