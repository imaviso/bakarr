import * as v from "valibot";

export const ConfigSchema = v.object({
  general: v.object({
    database_path: v.string(),
    log_level: v.string(),
    images_path: v.string(),
    suppress_connection_errors: v.boolean(),
    worker_threads: v.pipe(v.number(), v.integer(), v.minValue(0)),
    max_db_connections: v.pipe(v.number(), v.integer(), v.minValue(1)),
    min_db_connections: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  qbittorrent: v.object({
    enabled: v.boolean(),
    url: v.string(),
    username: v.string(),
    password: v.nullish(v.string()),
    default_category: v.string(),
  }),
  nyaa: v.object({
    base_url: v.string(),
    default_category: v.string(),
    filter_remakes: v.boolean(),
    preferred_resolution: v.nullish(v.string()),
    min_seeders: v.pipe(v.number(), v.integer(), v.minValue(0)),
  }),
  scheduler: v.object({
    enabled: v.boolean(),
    check_interval_minutes: v.pipe(v.number(), v.integer(), v.minValue(1)),
    cron_expression: v.nullish(v.string()),
    max_concurrent_checks: v.pipe(v.number(), v.integer(), v.minValue(1)),
    check_delay_seconds: v.pipe(v.number(), v.integer(), v.minValue(0)),
    metadata_refresh_hours: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  metadata: v.optional(
    v.object({
      anidb: v.object({
        enabled: v.boolean(),
        username: v.nullish(v.string()),
        password: v.nullish(v.string()),
        client: v.string(),
        client_version: v.pipe(v.number(), v.integer(), v.minValue(1)),
        local_port: v.pipe(v.number(), v.integer(), v.minValue(1025), v.maxValue(65535)),
        episode_limit: v.pipe(v.number(), v.integer(), v.minValue(1)),
      }),
    }),
  ),
  downloads: v.object({
    root_path: v.pipe(v.string(), v.minLength(1, "Path is required")),
    create_anime_folders: v.boolean(),
    preferred_groups: v.array(v.string()),
    use_seadex: v.boolean(),
    prefer_dual_audio: v.boolean(),
    preferred_codec: v.nullish(v.string()),
    max_size_gb: v.pipe(v.number(), v.minValue(0)),
    remote_path_mappings: v.array(v.array(v.string())),
    reconcile_completed_downloads: v.optional(v.boolean()),
    remove_torrent_on_import: v.optional(v.boolean()),
    delete_download_files_after_import: v.optional(v.boolean()),
  }),
  library: v.object({
    library_path: v.pipe(v.string(), v.minLength(1, "Path is required")),
    recycle_path: v.pipe(v.string(), v.minLength(1, "Path is required")),
    recycle_cleanup_days: v.pipe(v.number(), v.integer(), v.minValue(0)),
    naming_format: v.string(),
    import_mode: v.picklist(["copy", "move"]),
    movie_naming_format: v.string(),
    auto_scan_interval_hours: v.pipe(v.number(), v.integer(), v.minValue(0)),
    preferred_title: v.picklist(["romaji", "english", "native"]),
    airing_timezone: v.optional(v.string()),
    airing_day_start_hour: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(23)),
    ),
  }),
  profiles: v.array(
    v.object({
      name: v.string(),
      cutoff: v.string(),
      upgrade_allowed: v.boolean(),
      seadex_preferred: v.boolean(),
      allowed_qualities: v.array(v.string()),
      min_size: v.nullish(v.string()),
      max_size: v.nullish(v.string()),
    }),
  ),
});

export const IMPORT_MODE_OPTIONS = ["copy", "move"] as const;
export const PREFERRED_TITLE_OPTIONS = ["romaji", "english", "native"] as const;

export function importModeLabel(value: string) {
  return value === "copy" ? "Copy" : "Move";
}

export function preferredTitleLabel(value: string) {
  switch (value) {
    case "english":
      return "English";
    case "native":
      return "Native";
    default:
      return "Romaji";
  }
}

export function formatLastRun(dateStr?: string | null) {
  if (!dateStr) return "Never";
  try {
    const date = new Date(`${dateStr.replace(" ", "T")}Z`);
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

export type ConfigSettingsMode = "general" | "automation";
