// Shared system config wire contracts.
import { Schema, Struct } from "effect";

import { ImportModeSchema, PreferredTitleSchema } from "./ids.ts";
import { QualityProfileSchema } from "./profiles.ts";

export const StringListSchema = Schema.mutable(Schema.Array(Schema.String));

export const RemotePathMappingSchema = Schema.mutable(
  Schema.Array(Schema.String).pipe(Schema.check(Schema.isLengthBetween(2, 2))),
);

export const GeneralConfigSchema = Schema.Struct({
  database_path: Schema.String,
  log_level: Schema.String,
  images_path: Schema.String,
  suppress_connection_errors: Schema.Boolean,
  worker_threads: Schema.Number,
  max_db_connections: Schema.Number,
  min_db_connections: Schema.Number,
});

export const QbittorrentConfigSchema = Schema.Struct({
  default_category: Schema.String,
  enabled: Schema.Boolean,
  password: Schema.optional(Schema.NullOr(Schema.String)),
  ratio_limit: Schema.optional(Schema.NullOr(Schema.Number)),
  save_path: Schema.optional(Schema.NullOr(Schema.String)),
  trusted_local: Schema.optional(Schema.Boolean),
  url: Schema.String,
  username: Schema.String,
});

export const RtorrentConfigSchema = Schema.Struct({
  enabled: Schema.Boolean,
  save_path: Schema.optional(Schema.NullOr(Schema.String)),
  trusted_local: Schema.optional(Schema.Boolean),
  url: Schema.String,
});

export const NyaaConfigSchema = Schema.Struct({
  base_url: Schema.String,
  default_category: Schema.String,
  filter_remakes: Schema.Boolean,
  preferred_resolution: Schema.optional(Schema.NullOr(Schema.String)),
  min_seeders: Schema.Number,
});

export const SchedulerConfigSchema = Schema.Struct({
  enabled: Schema.Boolean,
  check_interval_minutes: Schema.Number,
  cron_expression: Schema.optional(Schema.NullOr(Schema.String)),
  max_concurrent_checks: Schema.Number,
  check_delay_seconds: Schema.Number,
  metadata_refresh_hours: Schema.Number,
});

export const AniDbMetadataConfigSchema = Schema.Struct({
  enabled: Schema.Boolean,
  username: Schema.optional(Schema.NullOr(Schema.String)),
  password: Schema.optional(Schema.NullOr(Schema.String)),
  client: Schema.String,
  client_version: Schema.Number,
  local_port: Schema.Number,
  episode_limit: Schema.Number,
});

export const MetadataProvidersConfigSchema = Schema.Struct({
  anidb: AniDbMetadataConfigSchema,
});

export const DownloadsConfigSchema = Schema.Struct({
  root_path: Schema.String,
  create_media_folders: Schema.Boolean,
  remote_path_mappings: Schema.mutable(Schema.Array(RemotePathMappingSchema)),
  reconcile_completed_downloads: Schema.optional(Schema.Boolean),
  remove_torrent_on_import: Schema.optional(Schema.Boolean),
  delete_download_files_after_import: Schema.optional(Schema.Boolean),
}).mapFields(Struct.map(Schema.mutableKey));

export const LibraryConfigSchema = Schema.Struct({
  anime_path: Schema.String,
  manga_path: Schema.String,
  light_novel_path: Schema.String,
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

export const ConfigSchema = Schema.Struct({
  general: GeneralConfigSchema,
  qbittorrent: QbittorrentConfigSchema,
  rtorrent: RtorrentConfigSchema,
  nyaa: NyaaConfigSchema,
  scheduler: SchedulerConfigSchema,
  downloads: DownloadsConfigSchema,
  library: LibraryConfigSchema,
  metadata: Schema.optional(MetadataProvidersConfigSchema),
  profiles: Schema.mutable(Schema.Array(Schema.suspend(() => QualityProfileSchema))),
}).mapFields(Struct.map(Schema.mutableKey));

export type Config = Schema.Schema.Type<typeof ConfigSchema>;
