import { Schema } from "effect";

export const StringListSchema = Schema.Array(Schema.String);
export const NumberListSchema = Schema.Array(Schema.Number.pipe(Schema.int()));

export const RemotePathMappingSchema = Schema.Array(Schema.String).pipe(
  Schema.itemsCount(2),
);

export const RuleTypeSchema = Schema.Literal("preferred", "must", "must_not");
export const ImportModeSchema = Schema.String.pipe(
  Schema.pattern(/^(copy|move)$/),
);
export const PreferredTitleSchema = Schema.String.pipe(
  Schema.pattern(/^(romaji|english|native)$/),
);

export const QualityProfileSchema = Schema.Struct({
  allowed_qualities: StringListSchema,
  cutoff: Schema.String,
  max_size: Schema.optional(Schema.NullOr(Schema.String)),
  min_size: Schema.optional(Schema.NullOr(Schema.String)),
  name: Schema.String,
  seadex_preferred: Schema.Boolean,
  upgrade_allowed: Schema.Boolean,
});

export const ReleaseProfileRuleSchema = Schema.Struct({
  rule_type: RuleTypeSchema,
  score: Schema.Number,
  term: Schema.String,
});

export const ReleaseProfileRulesSchema = Schema.Array(ReleaseProfileRuleSchema);

export const ReleaseProfileSchema = Schema.Struct({
  enabled: Schema.Boolean,
  id: Schema.Number,
  is_global: Schema.Boolean,
  name: Schema.String,
  rules: ReleaseProfileRulesSchema,
});

export const CreateReleaseProfileSchema = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  is_global: Schema.Boolean,
  name: Schema.String,
  rules: ReleaseProfileRulesSchema,
});

export const UpdateReleaseProfileSchema = Schema.Struct({
  enabled: Schema.Boolean,
  is_global: Schema.Boolean,
  name: Schema.String,
  rules: ReleaseProfileRulesSchema,
});

export const DownloadsConfigSchema = Schema.Struct({
  create_anime_folders: Schema.Boolean,
  delete_download_files_after_import: Schema.optional(Schema.Boolean),
  max_size_gb: Schema.Number,
  prefer_dual_audio: Schema.Boolean,
  preferred_codec: Schema.optional(Schema.NullOr(Schema.String)),
  preferred_groups: StringListSchema,
  reconcile_completed_downloads: Schema.optional(Schema.Boolean),
  remote_path_mappings: Schema.Array(RemotePathMappingSchema),
  remove_torrent_on_import: Schema.optional(Schema.Boolean),
  root_path: Schema.String,
  use_seadex: Schema.Boolean,
});

export const GeneralConfigSchema = Schema.Struct({
  database_path: Schema.String,
  images_path: Schema.String,
  log_level: Schema.String,
  max_db_connections: Schema.Number,
  min_db_connections: Schema.Number,
  suppress_connection_errors: Schema.Boolean,
  worker_threads: Schema.Number,
});

export const LibraryConfigSchema = Schema.Struct({
  auto_scan_interval_hours: Schema.Number,
  import_mode: ImportModeSchema,
  library_path: Schema.String,
  movie_naming_format: Schema.String,
  naming_format: Schema.String,
  preferred_title: PreferredTitleSchema,
  recycle_cleanup_days: Schema.Number,
  recycle_path: Schema.String,
});

export const NyaaConfigSchema = Schema.Struct({
  base_url: Schema.String,
  default_category: Schema.String,
  filter_remakes: Schema.Boolean,
  min_seeders: Schema.Number,
  preferred_resolution: Schema.optional(Schema.NullOr(Schema.String)),
});

export const QbittorrentConfigSchema = Schema.Struct({
  default_category: Schema.String,
  enabled: Schema.Boolean,
  password: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.String,
  username: Schema.String,
});

export const SchedulerConfigSchema = Schema.Struct({
  check_delay_seconds: Schema.Number,
  check_interval_minutes: Schema.Number,
  cron_expression: Schema.optional(Schema.NullOr(Schema.String)),
  enabled: Schema.Boolean,
  max_concurrent_checks: Schema.Number,
  metadata_refresh_hours: Schema.Number,
});

export const SecurityConfigSchema = Schema.Struct({
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
    trusted_proxy_ips: StringListSchema,
    window_seconds: Schema.Number,
  }),
  auto_migrate_password_hashes: Schema.Boolean,
});

export const ConfigCoreSchema = Schema.Struct({
  downloads: DownloadsConfigSchema,
  general: GeneralConfigSchema,
  library: LibraryConfigSchema,
  nyaa: NyaaConfigSchema,
  qbittorrent: QbittorrentConfigSchema,
  scheduler: SchedulerConfigSchema,
  security: SecurityConfigSchema,
});

export const ConfigSchema = Schema.Struct({
  downloads: DownloadsConfigSchema,
  general: GeneralConfigSchema,
  library: LibraryConfigSchema,
  nyaa: NyaaConfigSchema,
  profiles: Schema.Array(QualityProfileSchema),
  qbittorrent: QbittorrentConfigSchema,
  scheduler: SchedulerConfigSchema,
  security: SecurityConfigSchema,
});
