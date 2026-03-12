import { Schema } from "effect";

type SearchDownloadBody = {
  anime_id: number;
  episode_number: number;
  group?: string;
  info_hash?: string;
  is_batch?: boolean;
  magnet: string;
  title: string;
};

type AddRssFeedBody = {
  anime_id: number;
  name?: string;
  url: string;
};

type ImportUnmappedFolderBody = {
  anime_id: number;
  folder_name: string;
  profile_name?: string;
};

const PositiveIntFromString = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.greaterThan(0),
);

const StringArray = Schema.Array(Schema.String);
const NumberArray = Schema.Array(Schema.Number);
const RemotePathMappings = Schema.Array(Schema.Array(Schema.String));

export const LoginRequestSchema = Schema.Struct({
  password: Schema.String,
  username: Schema.String,
});

export const ApiKeyLoginRequestSchema = Schema.Struct({
  api_key: Schema.String,
});

export const ChangePasswordRequestSchema = Schema.Struct({
  current_password: Schema.String,
  new_password: Schema.String,
});

export const QualityProfileSchema = Schema.Struct({
  allowed_qualities: StringArray,
  cutoff: Schema.String,
  max_size: Schema.optional(Schema.NullOr(Schema.String)),
  min_size: Schema.optional(Schema.NullOr(Schema.String)),
  name: Schema.String,
  seadex_preferred: Schema.Boolean,
  upgrade_allowed: Schema.Boolean,
});

export const ReleaseProfileRuleSchema = Schema.Struct({
  rule_type: Schema.Literal("preferred", "must", "must_not"),
  score: Schema.Number,
  term: Schema.String,
});

export const ReleaseProfileSchema = Schema.Struct({
  enabled: Schema.Boolean,
  id: Schema.Number,
  is_global: Schema.Boolean,
  name: Schema.String,
  rules: Schema.Array(ReleaseProfileRuleSchema),
});

export const CreateReleaseProfileSchema = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  is_global: Schema.Boolean,
  name: Schema.String,
  rules: Schema.Array(ReleaseProfileRuleSchema),
});

export const UpdateReleaseProfileSchema = Schema.Struct({
  enabled: Schema.Boolean,
  is_global: Schema.Boolean,
  name: Schema.String,
  rules: Schema.Array(ReleaseProfileRuleSchema),
});

export const ConfigSchema = Schema.Struct({
  downloads: Schema.Struct({
    create_anime_folders: Schema.Boolean,
    delete_download_files_after_import: Schema.optional(Schema.Boolean),
    max_size_gb: Schema.Number,
    prefer_dual_audio: Schema.Boolean,
    preferred_codec: Schema.optional(Schema.NullOr(Schema.String)),
    preferred_groups: StringArray,
    reconcile_completed_downloads: Schema.optional(Schema.Boolean),
    remote_path_mappings: RemotePathMappings,
    remove_torrent_on_import: Schema.optional(Schema.Boolean),
    root_path: Schema.String,
    use_seadex: Schema.Boolean,
  }),
  general: Schema.Struct({
    database_path: Schema.String,
    images_path: Schema.String,
    log_level: Schema.String,
    max_db_connections: Schema.Number,
    min_db_connections: Schema.Number,
    suppress_connection_errors: Schema.Boolean,
    worker_threads: Schema.Number,
  }),
  library: Schema.Struct({
    auto_scan_interval_hours: Schema.Number,
    import_mode: Schema.String,
    library_path: Schema.String,
    movie_naming_format: Schema.String,
    naming_format: Schema.String,
    preferred_title: Schema.String,
    recycle_cleanup_days: Schema.Number,
    recycle_path: Schema.String,
  }),
  nyaa: Schema.Struct({
    base_url: Schema.String,
    default_category: Schema.String,
    filter_remakes: Schema.Boolean,
    min_seeders: Schema.Number,
    preferred_resolution: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  profiles: Schema.Array(QualityProfileSchema),
  qbittorrent: Schema.Struct({
    default_category: Schema.String,
    enabled: Schema.Boolean,
    password: Schema.optional(Schema.NullOr(Schema.String)),
    url: Schema.String,
    username: Schema.String,
  }),
  scheduler: Schema.Struct({
    check_delay_seconds: Schema.Number,
    check_interval_minutes: Schema.Number,
    cron_expression: Schema.optional(Schema.NullOr(Schema.String)),
    enabled: Schema.Boolean,
    max_concurrent_checks: Schema.Number,
    metadata_refresh_hours: Schema.Number,
  }),
  security: Schema.Struct({
    argon2_memory_cost_kib: Schema.Number,
    argon2_parallelism: Schema.Number,
    argon2_time_cost: Schema.Number,
    auth_throttle: Schema.Struct({
      lockout_seconds: Schema.Number,
      login_base_delay_ms: Schema.Number,
      login_max_delay_ms: Schema.Number,
      max_attempts: Schema.Number,
      password_base_delay_ms: Schema.Number,
      password_max_delay_ms: Schema.Number,
      trusted_proxy_ips: StringArray,
      window_seconds: Schema.Number,
    }),
    auto_migrate_password_hashes: Schema.Boolean,
  }),
});

export const AddAnimeInputSchema = Schema.Struct({
  id: Schema.Number,
  monitor_and_search: Schema.Boolean,
  monitored: Schema.Boolean,
  profile_name: Schema.String,
  release_profile_ids: NumberArray,
  root_folder: Schema.String,
});

export const MonitoredBodySchema = Schema.Struct({
  monitored: Schema.Boolean,
});

export const PathBodySchema = Schema.Struct({
  path: Schema.String,
});

export const ProfileNameBodySchema = Schema.Struct({
  profile_name: Schema.String,
});

export const ReleaseProfileIdsBodySchema = Schema.Struct({
  release_profile_ids: NumberArray,
});

export const FilePathBodySchema = Schema.Struct({
  file_path: Schema.String,
});

export const BulkEpisodeMappingsBodySchema = Schema.Struct({
  mappings: Schema.Array(Schema.Struct({
    episode_number: Schema.Number,
    file_path: Schema.String,
  })),
});

export const SearchDownloadBodySchema: Schema.Schema<SearchDownloadBody> =
  Schema.Struct({
    anime_id: Schema.Number,
    episode_number: Schema.Number,
    group: Schema.optional(Schema.String),
    info_hash: Schema.optional(Schema.String),
    is_batch: Schema.optional(Schema.Boolean),
    magnet: Schema.String,
    title: Schema.String,
  });

export const SearchMissingBodySchema = Schema.Struct({
  anime_id: Schema.optional(Schema.Number),
});

export const AddRssFeedBodySchema: Schema.Schema<AddRssFeedBody> = Schema
  .Struct({
    anime_id: Schema.Number,
    name: Schema.optional(Schema.String),
    url: Schema.String,
  });

export const EnabledBodySchema = Schema.Struct({
  enabled: Schema.Boolean,
});

export const ImportUnmappedFolderBodySchema: Schema.Schema<
  ImportUnmappedFolderBody
> = Schema.Struct({
  anime_id: Schema.Number,
  folder_name: Schema.String,
  profile_name: Schema.optional(Schema.String),
});

export const ScanImportPathBodySchema = Schema.Struct({
  anime_id: Schema.optional(Schema.Number),
  path: Schema.String,
});

export const ImportFilesBodySchema = Schema.Struct({
  files: Schema.Array(Schema.Struct({
    anime_id: Schema.Number,
    episode_number: Schema.Number,
    season: Schema.optional(Schema.Number),
    source_path: Schema.String,
  })),
});

export const IdParamsSchema = Schema.Struct({
  id: PositiveIntFromString,
});

export const NameParamsSchema = Schema.Struct({
  name: Schema.String,
});

export const AnimeEpisodeParamsSchema = Schema.Struct({
  episodeNumber: PositiveIntFromString,
  id: PositiveIntFromString,
});

export const SearchEpisodeParamsSchema = Schema.Struct({
  animeId: PositiveIntFromString,
  episodeNumber: PositiveIntFromString,
});

export const SystemLogsQuerySchema = Schema.Struct({
  end_date: Schema.optional(Schema.String),
  event_type: Schema.optional(Schema.String),
  level: Schema.optional(Schema.String),
  page: Schema.optional(PositiveIntFromString),
  start_date: Schema.optional(Schema.String),
});

export const SystemLogExportQuerySchema = Schema.Struct({
  end_date: Schema.optional(Schema.String),
  event_type: Schema.optional(Schema.String),
  format: Schema.optional(Schema.Literal("csv", "json")),
  level: Schema.optional(Schema.String),
  start_date: Schema.optional(Schema.String),
});

export const SearchAnimeQuerySchema = Schema.Struct({
  q: Schema.optional(Schema.String),
});

export const StreamQuerySchema = Schema.Struct({
  token: Schema.optional(Schema.String),
});

export const DownloadEventsQuerySchema = Schema.Struct({
  anime_id: Schema.optional(PositiveIntFromString),
  download_id: Schema.optional(PositiveIntFromString),
  event_type: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveIntFromString),
});

export const WantedMissingQuerySchema = Schema.Struct({
  limit: Schema.optional(PositiveIntFromString),
});

export const CalendarQuerySchema = Schema.Struct({
  end: Schema.optional(Schema.String),
  start: Schema.optional(Schema.String),
});

export const SearchReleasesQuerySchema = Schema.Struct({
  anime_id: Schema.optional(PositiveIntFromString),
  category: Schema.optional(Schema.String),
  filter: Schema.optional(Schema.String),
  query: Schema.optional(Schema.String),
});

export const BrowseQuerySchema = Schema.Struct({
  path: Schema.optional(Schema.String),
});

export const DeleteDownloadQuerySchema = Schema.Struct({
  delete_files: Schema.optional(Schema.Literal("false", "true")),
});
