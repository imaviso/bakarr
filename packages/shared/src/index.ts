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
  downloaded_percent?: number | undefined;
  is_up_to_date?: boolean | undefined;
  latest_downloaded_episode?: number | undefined;
  total?: number | undefined;
  missing: number[];
  next_missing_episode?: number | undefined;
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
    romaji?: string | undefined;
    english?: string | undefined;
    native?: string | undefined;
  };
  relation_type?: string | undefined;
  format?: string | undefined;
  status?: string | undefined;
  season?: AnimeSeason | undefined;
  season_year?: number | undefined;
  start_year?: number | undefined;
  cover_image?: string | undefined;
  rating?: number | undefined;
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
  mal_id?: number | undefined;
  title: {
    romaji: string;
    english?: string | undefined;
    native?: string | undefined;
  };
  format: string;
  source?: string | undefined;
  description?: string | undefined;
  background?: string | undefined;
  duration?: string | undefined;
  rating?: string | undefined;
  rank?: number | undefined;
  popularity?: number | undefined;
  members?: number | undefined;
  favorites?: number | undefined;
  score?: number | undefined;
  genres?: string[] | undefined;
  studios?: string[] | undefined;
  cover_image?: string | undefined;
  banner_image?: string | undefined;
  status: string;
  episode_count?: number | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
  start_year?: number | undefined;
  end_year?: number | undefined;
  synonyms?: string[] | undefined;
  related_anime?: AnimeDiscoveryEntry[] | undefined;
  recommended_anime?: AnimeDiscoveryEntry[] | undefined;
  next_airing_episode?: NextAiringEpisode | undefined;
  season?: AnimeSeason | undefined;
  season_year?: number | undefined;
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
    source: Schema.optional(Schema.String),
    description: Schema.optional(Schema.String),
    background: Schema.optional(Schema.String),
    duration: Schema.optional(Schema.String),
    rating: Schema.optional(Schema.String),
    rank: Schema.optional(Schema.Number),
    popularity: Schema.optional(Schema.Number),
    members: Schema.optional(Schema.Number),
    favorites: Schema.optional(Schema.Number),
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
  limit?: number | undefined;
  offset?: number | undefined;
  monitored?: boolean | undefined;
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
  title?: string | undefined;
  aired?: string | undefined;
  is_future?: boolean | undefined;
  airing_status?: EpisodeAiringStatus | undefined;
  downloaded: boolean;
  file_path?: string | undefined;
  file_size?: number | undefined;
  duration_seconds?: number | undefined;
  group?: string | undefined;
  resolution?: string | undefined;
  quality?: string | undefined;
  video_codec?: string | undefined;
  audio_codec?: string | undefined;
  audio_channels?: string | undefined;
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
  duration_seconds?: number | undefined;
  episode_number?: number | undefined;
  episode_numbers?: number[] | undefined;
  coverage_summary?: string | undefined;
  source_identity?: ParsedEpisodeIdentity | undefined;
  episode_title?: string | undefined;
  air_date?: string | undefined;
  group?: string | undefined;
  resolution?: string | undefined;
  quality?: string | undefined;
  video_codec?: string | undefined;
  audio_codec?: string | undefined;
  audio_channels?: string | undefined;
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
  name?: string | undefined;
  last_checked?: string | undefined;
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
    episode_title?: string | undefined;
    airing_status?: EpisodeAiringStatus | undefined;
    downloaded: boolean;
    is_future?: boolean | undefined;
    anime_image?: string | undefined;
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
  anime_image?: string | undefined;
  episode_number: number;
  torrent_name: string;
  is_batch?: boolean | undefined;
  covered_episodes?: number[] | undefined;
  coverage_pending?: boolean | undefined;
  decision_reason?: string | undefined;
  imported_path?: string | undefined;
  status?: string | undefined;
  progress?: number | undefined;
  added_at?: string | undefined;
  download_date?: string | undefined;
  group_name?: string | undefined;
  external_state?: string | undefined;
  error_message?: string | undefined;
  save_path?: string | undefined;
  content_path?: string | undefined;
  total_bytes?: number | undefined;
  downloaded_bytes?: number | undefined;
  speed_bytes?: number | undefined;
  eta_seconds?: number | undefined;
  last_synced_at?: string | undefined;
  retry_count?: number | undefined;
  last_error_at?: string | undefined;
  reconciled_at?: string | undefined;
  source_metadata?: DownloadSourceMetadata | undefined;
  allowed_actions?: DownloadAllowedAction[] | undefined;
}

export const DOWNLOAD_ALLOWED_ACTION_VALUES = [
  "pause",
  "resume",
  "retry",
  "reconcile",
  "delete",
] as const;

export type DownloadAllowedAction = (typeof DOWNLOAD_ALLOWED_ACTION_VALUES)[number];

export const DownloadAllowedActionSchema: Schema.Schema<DownloadAllowedAction> = Schema.Literal(
  ...DOWNLOAD_ALLOWED_ACTION_VALUES,
);

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
    allowed_actions: Schema.optional(Schema.mutable(Schema.Array(DownloadAllowedActionSchema))),
  }),
);

export interface DownloadHistoryPage {
  downloads: Download[];
  limit: number;
  total: number;
  has_more: boolean;
  next_cursor?: string | undefined;
}

export const DownloadHistoryPageSchema: Schema.Schema<DownloadHistoryPage> = Schema.Struct({
  downloads: Schema.mutable(Schema.Array(DownloadSchema)),
  limit: Schema.Number,
  total: Schema.Number,
  has_more: Schema.Boolean,
  next_cursor: Schema.optional(Schema.String),
});

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
  episode_number?: number | undefined;
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
  metadata_providers: {
    anidb: {
      enabled: boolean;
      configured: boolean;
    };
    jikan: {
      enabled: boolean;
      configured: boolean;
    };
    manami: {
      enabled: boolean;
      configured: boolean;
    };
  };
  disk_space: {
    free: number;
    total: number;
  };
  last_scan?: string | null | undefined;
  last_rss?: string | null | undefined;
  last_metadata_refresh?: string | null | undefined;
}

export const DiskSpaceSchema: Schema.Schema<SystemStatus["disk_space"]> = Schema.Struct({
  free: Schema.Number,
  total: Schema.Number,
});

export const SystemStatusMetadataProvidersSchema: Schema.Schema<
  SystemStatus["metadata_providers"]
> = Schema.Struct({
  anidb: Schema.Struct({
    enabled: Schema.Boolean,
    configured: Schema.Boolean,
  }),
  jikan: Schema.Struct({
    enabled: Schema.Boolean,
    configured: Schema.Boolean,
  }),
  manami: Schema.Struct({
    enabled: Schema.Boolean,
    configured: Schema.Boolean,
  }),
});

export const SystemStatusSchema: Schema.Schema<SystemStatus> = Schema.Struct({
  version: Schema.String,
  uptime: Schema.Number,
  active_torrents: Schema.Number,
  pending_downloads: Schema.Number,
  metadata_providers: SystemStatusMetadataProvidersSchema,
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
  min_size?: string | null | undefined;
  max_size?: string | null | undefined;
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
  password?: string | null | undefined;
  default_category: string;
  trusted_local?: boolean | undefined;
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
  preferred_resolution?: string | null | undefined;
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
  cron_expression?: string | null | undefined;
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

export const AniDbMetadataConfigSchema: Schema.Schema<{
  enabled: boolean;
  username?: string | null | undefined;
  password?: string | null | undefined;
  client: string;
  client_version: number;
  local_port: number;
  episode_limit: number;
}> = Schema.Struct({
  enabled: Schema.Boolean,
  username: Schema.optional(Schema.NullOr(Schema.String)),
  password: Schema.optional(Schema.NullOr(Schema.String)),
  client: Schema.String,
  client_version: Schema.Number,
  local_port: Schema.Number,
  episode_limit: Schema.Number,
});

export const MetadataProvidersConfigSchema: Schema.Schema<{
  anidb: Schema.Schema.Type<typeof AniDbMetadataConfigSchema>;
}> = Schema.Struct({
  anidb: AniDbMetadataConfigSchema,
});

export const DownloadsConfigSchema: Schema.Schema<{
  root_path: string;
  create_anime_folders: boolean;
  remote_path_mappings: string[][];
  reconcile_completed_downloads?: boolean | undefined;
  remove_torrent_on_import?: boolean | undefined;
  delete_download_files_after_import?: boolean | undefined;
}> = Schema.mutable(
  Schema.Struct({
    root_path: Schema.String,
    create_anime_folders: Schema.Boolean,
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
  airing_timezone?: string | undefined;
  airing_day_start_hour?: number | undefined;
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
  metadata?: Schema.Schema.Type<typeof MetadataProvidersConfigSchema> | undefined;
  profiles: Array<Schema.Schema.Type<typeof QualityProfileSchema>>;
}> = Schema.mutable(
  Schema.Struct({
    general: GeneralConfigSchema,
    qbittorrent: QbittorrentConfigSchema,
    nyaa: NyaaConfigSchema,
    scheduler: SchedulerConfigSchema,
    downloads: DownloadsConfigSchema,
    library: LibraryConfigSchema,
    metadata: Schema.optional(MetadataProvidersConfigSchema),
    profiles: Schema.mutable(Schema.Array(Schema.suspend(() => QualityProfileSchema))),
  }),
);

export type Config = Schema.Schema.Type<typeof ConfigSchema>;

export interface SystemLog {
  id: number;
  event_type: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  details?: string | undefined;
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
  last_run_at?: string | undefined;
  last_success_at?: string | undefined;
  last_status?: string | undefined;
  last_message?: string | undefined;
  progress_current?: number | undefined;
  progress_total?: number | undefined;
  run_count: number;
  schedule_mode?: "cron" | "interval" | "manual" | "disabled" | undefined;
  schedule_value?: string | undefined;
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

export const OPERATION_TASK_KEY_VALUES = [
  "anime_scan_folder",
  "library_import",
  "downloads_search_missing_manual",
  "anime_refresh_episodes_manual",
  "downloads_sync_manual",
  "system_task_scan_manual",
  "system_task_rss_manual",
  "system_task_metadata_refresh_manual",
  "unmapped_scan_manual",
] as const;
export type OperationTaskKey = (typeof OPERATION_TASK_KEY_VALUES)[number];
export const OperationTaskKeySchema: Schema.Schema<OperationTaskKey> = Schema.Literal(
  ...OPERATION_TASK_KEY_VALUES,
);

export const OPERATION_TASK_STATUS_VALUES = ["queued", "running", "succeeded", "failed"] as const;
export type OperationTaskStatus = (typeof OPERATION_TASK_STATUS_VALUES)[number];
export const OperationTaskStatusSchema: Schema.Schema<OperationTaskStatus> = Schema.Literal(
  ...OPERATION_TASK_STATUS_VALUES,
);

export interface OperationTaskPayload {
  anime_id?: number | undefined;
  error?: string | undefined;
  imported?: number | undefined;
  failed?: number | undefined;
  found?: number | undefined;
  total?: number | undefined;
}

export const OperationTaskPayloadSchema: Schema.Schema<OperationTaskPayload> = Schema.Struct({
  anime_id: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
  imported: Schema.optional(Schema.Number),
  failed: Schema.optional(Schema.Number),
  found: Schema.optional(Schema.Number),
  total: Schema.optional(Schema.Number),
});

export interface OperationTask {
  id: number;
  task_key: OperationTaskKey;
  status: OperationTaskStatus;
  progress_current?: number | undefined;
  progress_total?: number | undefined;
  message?: string | undefined;
  created_at: string;
  started_at?: string | undefined;
  finished_at?: string | undefined;
  updated_at: string;
  anime_id?: number | undefined;
  payload?: OperationTaskPayload | undefined;
}

export const OperationTaskSchema: Schema.Schema<OperationTask> = Schema.Struct({
  id: Schema.Number,
  task_key: OperationTaskKeySchema,
  status: OperationTaskStatusSchema,
  progress_current: Schema.optional(Schema.Number),
  progress_total: Schema.optional(Schema.Number),
  message: Schema.optional(Schema.String),
  created_at: Schema.String,
  started_at: Schema.optional(Schema.String),
  finished_at: Schema.optional(Schema.String),
  updated_at: Schema.String,
  anime_id: Schema.optional(Schema.Number),
  payload: Schema.optional(OperationTaskPayloadSchema),
});

export interface AsyncOperationAccepted {
  accepted_at: string;
  message: string;
  status: "queued";
  task_key: OperationTaskKey;
  task_id: number;
}

export const AsyncOperationAcceptedSchema: Schema.Schema<AsyncOperationAccepted> = Schema.Struct({
  accepted_at: Schema.String,
  message: Schema.String,
  status: Schema.Literal("queued"),
  task_key: OperationTaskKeySchema,
  task_id: Schema.Number,
});

export interface DownloadEventMetadata {
  covered_episodes?: number[] | undefined;
  imported_path?: string | undefined;
  source_metadata?: DownloadSourceMetadata | undefined;
}

export interface DownloadEvent {
  id: number;
  download_id?: number | undefined;
  anime_id?: number | undefined;
  anime_image?: string | undefined;
  anime_title?: string | undefined;
  event_type: string;
  from_status?: string | undefined;
  to_status?: string | undefined;
  message: string;
  metadata?: string | undefined;
  metadata_json?: DownloadEventMetadata | undefined;
  torrent_name?: string | undefined;
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
  next_cursor?: string | undefined;
  prev_cursor?: string | undefined;
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
  size?: number | undefined;
}

export const BrowseEntrySchema: Schema.Schema<BrowseEntry> = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  is_directory: Schema.Boolean,
  size: Schema.optional(Schema.Number),
});

export interface BrowseResult {
  current_path: string;
  parent_path?: string | undefined;
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
  episode_title?: string | undefined;
  aired?: string | undefined;
  airing_status?: EpisodeAiringStatus | undefined;
  anime_image?: string | undefined;
  is_future?: boolean | undefined;
  next_airing_episode?: NextAiringEpisode | undefined;
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
  title_source?: NamingTitleSource | undefined;
  season?: number | undefined;
  year?: number | undefined;
  episode_title?: string | undefined;
  air_date?: string | undefined;
  group?: string | undefined;
  resolution?: string | undefined;
  quality?: string | undefined;
  video_codec?: string | undefined;
  audio_codec?: string | undefined;
  audio_channels?: string | undefined;
  source_identity?: ParsedEpisodeIdentity | undefined;
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
  episode_numbers?: number[] | undefined;
  current_path: string;
  new_path: string;
  new_filename: string;
  format_used?: string | undefined;
  fallback_used?: boolean | undefined;
  warnings?: string[] | undefined;
  missing_fields?: string[] | undefined;
  metadata_snapshot?: RenamePreviewMetadataSnapshot | undefined;
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
  season?: number | undefined;
  episode_numbers?: number[] | undefined;
  air_dates?: string[] | undefined;
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
  parsed_title?: string | undefined;
  source_identity?: ParsedEpisodeIdentity | undefined;
  decision_reason?: string | undefined;
  selection_kind?: DownloadSelectionKind | undefined;
  selection_score?: number | undefined;
  previous_quality?: string | undefined;
  previous_score?: number | undefined;
  chosen_from_seadex?: boolean | undefined;
  episode_title?: string | undefined;
  air_date?: string | undefined;
  group?: string | undefined;
  resolution?: string | undefined;
  quality?: string | undefined;
  video_codec?: string | undefined;
  audio_codec?: string | undefined;
  audio_channels?: string | undefined;
  trusted?: boolean | undefined;
  remake?: boolean | undefined;
  source_url?: string | undefined;
  indexer?: string | undefined;
  is_seadex?: boolean | undefined;
  is_seadex_best?: boolean | undefined;
  seadex_release_group?: string | undefined;
  seadex_tags?: string[] | undefined;
  seadex_notes?: string | undefined;
  seadex_comparison?: string | undefined;
  seadex_dual_audio?: boolean | undefined;
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
  episode_numbers?: number[] | undefined;
  file_path?: string | undefined;
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
  size?: number | undefined;
  parsed_title: string;
  episode_number: number;
  episode_numbers?: number[] | undefined;
  coverage_summary?: string | undefined;
  episode_title?: string | undefined;
  air_date?: string | undefined;
  season?: number | undefined;
  group?: string | undefined;
  resolution?: string | undefined;
  quality?: string | undefined;
  video_codec?: string | undefined;
  audio_codec?: string | undefined;
  audio_channels?: string | undefined;
  duration_seconds?: number | undefined;
  matched_anime?:
    | {
        id: number;
        title: string;
      }
    | undefined;
  suggested_candidate_id?: number | undefined;
  match_confidence?: number | undefined;
  match_reason?: string | undefined;
  existing_mapping?: FileEpisodeMapping | undefined;
  episode_conflict?: FileEpisodeMapping | undefined;
  source_identity?: ParsedEpisodeIdentity | undefined;
  skip_reason?: string | undefined;
  needs_manual_mapping?: boolean | undefined;
  warnings?: string[] | undefined;
  naming_filename?: string | undefined;
  naming_format_used?: string | undefined;
  naming_fallback_used?: boolean | undefined;
  naming_warnings?: string[] | undefined;
  naming_missing_fields?: string[] | undefined;
  naming_metadata_snapshot?: RenamePreviewMetadataSnapshot | undefined;
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
  truncated?: boolean | undefined;
  total_scanned?: number | undefined;
}

export const ScanResultSchema: Schema.Schema<ScanResult> = Schema.mutable(
  Schema.Struct({
    files: Schema.mutable(Schema.Array(ScannedFileSchema)),
    skipped: Schema.mutable(Schema.Array(SkippedFileSchema)),
    candidates: Schema.mutable(Schema.Array(Schema.suspend(() => AnimeSearchResultSchema))),
    truncated: Schema.optional(Schema.Boolean),
    total_scanned: Schema.optional(Schema.Number),
  }),
);

export interface ImportedFile {
  source_path: string;
  destination_path: string;
  anime_id: number;
  episode_number: number;
  episode_numbers?: number[] | undefined;
  naming_format_used?: string | undefined;
  naming_fallback_used?: boolean | undefined;
  naming_warnings?: string[] | undefined;
  naming_missing_fields?: string[] | undefined;
  naming_metadata_snapshot?: RenamePreviewMetadataSnapshot | undefined;
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

export interface ImportFileSelection {
  anime_id: number;
  episode_number: number;
  episode_numbers?: number[] | undefined;
  season?: number | undefined;
  source_metadata?: DownloadSourceMetadata | undefined;
  source_path: string;
}

export const ImportFileSelectionSchema: Schema.Schema<ImportFileSelection> = Schema.Struct({
  anime_id: Schema.Number,
  episode_number: Schema.Number,
  episode_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  season: Schema.optional(Schema.Number),
  source_metadata: Schema.optional(Schema.suspend(() => DownloadSourceMetadataSchema)),
  source_path: Schema.String,
});

export interface ImportCandidateSelectionRequest {
  candidate_id: number;
  candidate_title: string;
  force_select?: boolean | undefined;
  files: ScannedFile[];
  selected_candidate_ids: number[];
  selected_files: ImportFileSelection[];
}

export const ImportCandidateSelectionRequestSchema: Schema.Schema<ImportCandidateSelectionRequest> =
  Schema.Struct({
    candidate_id: Schema.Number,
    candidate_title: Schema.String,
    force_select: Schema.optional(Schema.Boolean),
    files: Schema.mutable(Schema.Array(ScannedFileSchema)),
    selected_candidate_ids: Schema.mutable(Schema.Array(Schema.Number)),
    selected_files: Schema.mutable(Schema.Array(ImportFileSelectionSchema)),
  });

export interface ImportCandidateSelectionResult {
  selected_candidate_ids: number[];
  selected_files: ImportFileSelection[];
}

export const ImportCandidateSelectionResultSchema: Schema.Schema<ImportCandidateSelectionResult> =
  Schema.Struct({
    selected_candidate_ids: Schema.mutable(Schema.Array(Schema.Number)),
    selected_files: Schema.mutable(Schema.Array(ImportFileSelectionSchema)),
  });

export interface DownloadAction {
  Accept?:
    | {
        quality: Quality;
        is_seadex: boolean;
        is_seadex_best?: boolean | undefined;
        score: number;
      }
    | undefined;
  Upgrade?:
    | {
        quality: Quality;
        is_seadex: boolean;
        is_seadex_best?: boolean | undefined;
        score: number;
        reason: string;
        old_file_path?: string | undefined;
        old_quality: Quality;
        old_score?: number | undefined;
      }
    | undefined;
  Reject?: { reason: string } | undefined;
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

export interface SearchDownloadReleaseContext {
  group?: string | undefined;
  indexer?: string | undefined;
  info_hash?: string | undefined;
  parsed_resolution?: string | undefined;
  trusted?: boolean | undefined;
  remake?: boolean | undefined;
  source_url?: string | undefined;
  is_seadex?: boolean | undefined;
  is_seadex_best?: boolean | undefined;
  seadex_release_group?: string | undefined;
  seadex_tags?: string[] | undefined;
  seadex_notes?: string | undefined;
  seadex_comparison?: string | undefined;
  seadex_dual_audio?: boolean | undefined;
  download_action?: DownloadAction | undefined;
}

export const SearchDownloadReleaseContextSchema: Schema.Schema<SearchDownloadReleaseContext> =
  Schema.Struct({
    group: Schema.optional(Schema.String),
    indexer: Schema.optional(Schema.String),
    info_hash: Schema.optional(Schema.String),
    parsed_resolution: Schema.optional(Schema.String),
    trusted: Schema.optional(Schema.Boolean),
    remake: Schema.optional(Schema.Boolean),
    source_url: Schema.optional(Schema.String),
    is_seadex: Schema.optional(Schema.Boolean),
    is_seadex_best: Schema.optional(Schema.Boolean),
    seadex_release_group: Schema.optional(Schema.String),
    seadex_tags: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
    seadex_notes: Schema.optional(Schema.String),
    seadex_comparison: Schema.optional(Schema.String),
    seadex_dual_audio: Schema.optional(Schema.Boolean),
    download_action: Schema.optional(DownloadActionSchema),
  });

export interface SearchDownloadRequest {
  anime_id: number;
  magnet: string;
  title: string;
  episode_number?: number | undefined;
  is_batch?: boolean | undefined;
  release_context?: SearchDownloadReleaseContext | undefined;
}

export const SearchDownloadRequestSchema: Schema.Schema<SearchDownloadRequest> = Schema.Struct({
  anime_id: Schema.Number,
  magnet: Schema.String,
  title: Schema.String,
  episode_number: Schema.optional(Schema.Number),
  is_batch: Schema.optional(Schema.Boolean),
  release_context: Schema.optional(SearchDownloadReleaseContextSchema),
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
  parsed_episode?: string | undefined;
  parsed_group?: string | undefined;
  parsed_quality?: string | undefined;
  parsed_resolution?: string | undefined;
  parsed_episode_label?: string | undefined;
  parsed_episode_numbers?: number[] | undefined;
  parsed_air_date?: string | undefined;
  trusted: boolean;
  is_seadex: boolean;
  is_seadex_best: boolean;
  seadex_release_group?: string | undefined;
  seadex_tags?: string[] | undefined;
  seadex_notes?: string | undefined;
  seadex_comparison?: string | undefined;
  seadex_dual_audio?: boolean | undefined;
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
  group?: string | undefined;
  parsed_resolution?: string | undefined;
  parsed_episode_label?: string | undefined;
  parsed_episode_numbers?: number[] | undefined;
  parsed_air_date?: string | undefined;
  trusted?: boolean | undefined;
  remake?: boolean | undefined;
  view_url?: string | undefined;
  is_seadex?: boolean | undefined;
  is_seadex_best?: boolean | undefined;
  seadex_release_group?: string | undefined;
  seadex_comparison?: string | undefined;
  seadex_dual_audio?: boolean | undefined;
  seadex_tags?: string[] | undefined;
  seadex_notes?: string | undefined;
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

export const SEARCH_RELEASE_CATEGORY_OPTIONS = [
  "anime_english",
  "anime_non_english",
  "anime_raw",
  "all_anime",
] as const;

export type SearchReleaseCategory = (typeof SEARCH_RELEASE_CATEGORY_OPTIONS)[number];

export const SEARCH_RELEASE_CATEGORY_LABELS: Record<SearchReleaseCategory, string> = {
  anime_english: "Anime (English)",
  anime_non_english: "Anime (Non-Eng)",
  anime_raw: "Anime (Raw)",
  all_anime: "All Anime",
};

export const SEARCH_RELEASE_FILTER_OPTIONS = ["no_filter", "no_remakes", "trusted_only"] as const;

export type SearchReleaseFilter = (typeof SEARCH_RELEASE_FILTER_OPTIONS)[number];

export const SEARCH_RELEASE_FILTER_LABELS: Record<SearchReleaseFilter, string> = {
  no_filter: "No Filter",
  no_remakes: "No Remakes",
  trusted_only: "Trusted Only",
};

export const DOWNLOAD_EVENT_TYPE_FILTER_OPTIONS = [
  "all",
  "download.queued",
  "download.imported",
  "download.imported.batch",
  "download.retried",
  "download.status_changed",
  "download.coverage_refined",
  "download.deleted",
  "download.search_missing.queued",
  "download.rss.queued",
] as const;

export type DownloadEventTypeFilterOption = (typeof DOWNLOAD_EVENT_TYPE_FILTER_OPTIONS)[number];

export const SearchResultsSchema: Schema.Schema<SearchResults> = Schema.mutable(
  Schema.Struct({
    results: Schema.mutable(Schema.Array(NyaaSearchResultSchema)),
    seadex_groups: StringListSchema,
  }),
);

export interface AnimeSearchResult {
  id: number;
  title: {
    romaji?: string | undefined;
    english?: string | undefined;
    native?: string | undefined;
  };
  format?: string | undefined;
  source?: string | undefined;
  duration?: string | undefined;
  rating?: string | undefined;
  rank?: number | undefined;
  popularity?: number | undefined;
  members?: number | undefined;
  favorites?: number | undefined;
  episode_count?: number | undefined;
  status?: string | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
  start_year?: number | undefined;
  end_year?: number | undefined;
  season?: AnimeSeason | undefined;
  season_year?: number | undefined;
  cover_image?: string | undefined;
  banner_image?: string | undefined;
  description?: string | undefined;
  genres?: string[] | undefined;
  synonyms?: string[] | undefined;
  related_anime?: AnimeDiscoveryEntry[] | undefined;
  recommended_anime?: AnimeDiscoveryEntry[] | undefined;
  match_confidence?: number | undefined;
  match_reason?: string | undefined;
  already_in_library?: boolean | undefined;
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
  source: Schema.optional(Schema.String),
  duration: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.String),
  rank: Schema.optional(Schema.Number),
  popularity: Schema.optional(Schema.Number),
  members: Schema.optional(Schema.Number),
  favorites: Schema.optional(Schema.Number),
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

export interface SeasonalAnimeQueryParams {
  season?: AnimeSeason | undefined;
  year?: number | undefined;
  limit?: number | undefined;
  page?: number | undefined;
}

export const SeasonalAnimeQueryParamsSchema: Schema.Schema<SeasonalAnimeQueryParams> =
  Schema.Struct({
    season: Schema.optional(AnimeSeasonSchema),
    year: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.between(1970, 2100))),
    limit: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.between(1, 50))),
    page: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
  });

export const SEASONAL_ANIME_PROVIDER_VALUES = ["anilist", "jikan_fallback"] as const;

export type SeasonalAnimeProvider = (typeof SEASONAL_ANIME_PROVIDER_VALUES)[number];

export const SeasonalAnimeProviderSchema: Schema.Schema<SeasonalAnimeProvider> = Schema.Literal(
  ...SEASONAL_ANIME_PROVIDER_VALUES,
);

export interface SeasonalAnimeResponse {
  season: AnimeSeason;
  year: number;
  page: number;
  limit: number;
  has_more: boolean;
  provider: SeasonalAnimeProvider;
  degraded: boolean;
  results: AnimeSearchResult[];
}

export interface AnimeSeasonWindow {
  season: AnimeSeason;
  year: number;
}

export function resolveSeasonFromDate(now: Date): AnimeSeason {
  const month = now.getMonth() + 1;

  if (month <= 2 || month === 12) {
    return "winter";
  }

  if (month <= 5) {
    return "spring";
  }

  if (month <= 8) {
    return "summer";
  }

  return "fall";
}

export function resolveSeasonYearFromDate(now: Date): number {
  return now.getMonth() + 1 === 12 ? now.getFullYear() + 1 : now.getFullYear();
}

export function resolveSeasonWindowFromDate(now: Date = new Date()): AnimeSeasonWindow {
  return {
    season: resolveSeasonFromDate(now),
    year: resolveSeasonYearFromDate(now),
  };
}

export const SeasonalAnimeResponseSchema: Schema.Schema<SeasonalAnimeResponse> = Schema.mutable(
  Schema.Struct({
    season: AnimeSeasonSchema,
    year: Schema.Number,
    page: Schema.Number.pipe(Schema.int(), Schema.positive()),
    limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 50)),
    has_more: Schema.Boolean,
    provider: SeasonalAnimeProviderSchema,
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
  match_attempts?: number | undefined;
  last_match_error?: string | undefined;
  last_matched_at?: string | undefined;
  match_status?: UnmappedFolderMatchStatus | undefined;
  name: string;
  path: string;
  search_queries?: string[] | undefined;
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
  last_updated?: string | undefined;
  match_status: ScannerMatchStatus;
  match_counts: ScannerMatchCounts;
}

export type ScannerMatchStatus = "running" | "retrying" | "queued" | "paused" | "failed" | "idle";

export const ScannerMatchStatusSchema: Schema.Schema<ScannerMatchStatus> = Schema.Literal(
  "running",
  "retrying",
  "queued",
  "paused",
  "failed",
  "idle",
);

export interface ScannerMatchCounts {
  exact: number;
  queued: number;
  matching: number;
  matched: number;
  failed: number;
  paused: number;
}

export const ScannerMatchCountsSchema: Schema.Schema<ScannerMatchCounts> = Schema.Struct({
  exact: Schema.Number,
  queued: Schema.Number,
  matching: Schema.Number,
  matched: Schema.Number,
  failed: Schema.Number,
  paused: Schema.Number,
});

export const ScannerStateSchema: Schema.Schema<ScannerState> = Schema.mutable(
  Schema.Struct({
    has_outstanding_matches: Schema.Boolean,
    is_scanning: Schema.Boolean,
    folders: Schema.mutable(Schema.Array(UnmappedFolderSchema)),
    last_updated: Schema.optional(Schema.String),
    match_status: ScannerMatchStatusSchema,
    match_counts: ScannerMatchCountsSchema,
  }),
);

export interface DownloadStatus {
  anime_id?: number | undefined;
  anime_title?: string | undefined;
  id?: number | undefined;
  episode_number?: number | undefined;
  anime_image?: string | undefined;
  decision_reason?: string | undefined;
  hash: string;
  imported_path?: string | undefined;
  name: string;
  progress: number;
  speed: number;
  eta: number;
  state: string;
  total_bytes: number;
  downloaded_bytes: number;
  is_batch?: boolean | undefined;
  covered_episodes?: number[] | undefined;
  coverage_pending?: boolean | undefined;
  source_metadata?: DownloadSourceMetadata | undefined;
  allowed_actions?: DownloadAllowedAction[] | undefined;
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
  allowed_actions: Schema.optional(Schema.mutable(Schema.Array(DownloadAllowedActionSchema))),
});

export type NotificationEvent =
  | { type: "ScanStarted" }
  | { type: "ScanFinished" }
  | { type: "ScanProgress"; payload: { current: number; total: number } }
  | {
      type: "DownloadStarted";
      payload: {
        title: string;
        anime_id?: number | undefined;
        source_metadata?: DownloadSourceMetadata | undefined;
      };
    }
  | {
      type: "DownloadFinished";
      payload: {
        title: string;
        anime_id?: number | undefined;
        imported_path?: string | undefined;
        source_metadata?: DownloadSourceMetadata | undefined;
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
      payload: { scanned: number; matched: number; updated?: number | undefined };
    }
  | { type: "LibraryScanProgress"; payload: { scanned: number } }
  | { type: "RssCheckStarted" }
  | {
      type: "RssCheckFinished";
      payload: { total_feeds?: number | undefined; new_items: number };
    }
  | {
      type: "RssCheckProgress";
      payload: { current: number; total: number; feed_name: string };
    }
  | { type: "PasswordChanged" }
  | { type: "ApiKeyRegenerated" }
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
    Schema.Struct({ type: Schema.Literal("PasswordChanged") }),
    Schema.Struct({ type: Schema.Literal("ApiKeyRegenerated") }),
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

export const NotificationEventWireSchema: Schema.Schema<NotificationEvent, string> =
  Schema.parseJson(NotificationEventSchema);

export const decodeNotificationEventWire = Schema.decodeUnknownEither(NotificationEventWireSchema);

export const encodeNotificationEventWire = Schema.encode(NotificationEventWireSchema);
