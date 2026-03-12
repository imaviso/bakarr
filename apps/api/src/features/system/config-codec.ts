import { Schema } from "effect";

import type {
  Config,
  QualityProfile,
  ReleaseProfile,
  ReleaseProfileRule,
} from "../../../../../packages/shared/src/index.ts";
import { qualityProfiles, releaseProfiles } from "../../db/schema.ts";

export type ConfigCore = Omit<Config, "profiles">;

const StringListSchema = Schema.Array(Schema.String);
const NumberListSchema = Schema.Array(Schema.Number.pipe(Schema.int()));

const ReleaseProfileRuleSchema = Schema.Struct({
  rule_type: Schema.Literal("preferred", "must", "must_not"),
  score: Schema.Number,
  term: Schema.String,
});

const ReleaseProfileRulesSchema = Schema.Array(ReleaseProfileRuleSchema);

const ConfigCoreSchema = Schema.Struct({
  downloads: Schema.Struct({
    create_anime_folders: Schema.Boolean,
    delete_download_files_after_import: Schema.optional(Schema.Boolean),
    max_size_gb: Schema.Number,
    prefer_dual_audio: Schema.Boolean,
    preferred_codec: Schema.optional(Schema.NullOr(Schema.String)),
    preferred_groups: StringListSchema,
    reconcile_completed_downloads: Schema.optional(Schema.Boolean),
    remote_path_mappings: Schema.Array(StringListSchema),
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
      trusted_proxy_ips: StringListSchema,
      window_seconds: Schema.Number,
    }),
    auto_migrate_password_hashes: Schema.Boolean,
  }),
});

const StringListJsonSchema = Schema.parseJson(StringListSchema);
const NumberListJsonSchema = Schema.parseJson(NumberListSchema);
const ReleaseProfileRulesJsonSchema = Schema.parseJson(ReleaseProfileRulesSchema);
const ConfigCoreJsonSchema = Schema.parseJson(ConfigCoreSchema);

export function encodeQualityProfileRow(profile: QualityProfile) {
  return {
    allowedQualities: encodeStringList(profile.allowed_qualities),
    cutoff: profile.cutoff,
    maxSize: profile.max_size ?? null,
    minSize: profile.min_size ?? null,
    name: profile.name,
    seadexPreferred: profile.seadex_preferred,
    upgradeAllowed: profile.upgrade_allowed,
  };
}

export function decodeQualityProfileRow(
  row: typeof qualityProfiles.$inferSelect,
): QualityProfile {
  return {
    allowed_qualities: decodeStringList(row.allowedQualities),
    cutoff: row.cutoff,
    max_size: row.maxSize ?? null,
    min_size: row.minSize ?? null,
    name: row.name,
    seadex_preferred: row.seadexPreferred,
    upgrade_allowed: row.upgradeAllowed,
  };
}

export function decodeReleaseProfileRow(
  row: typeof releaseProfiles.$inferSelect,
): ReleaseProfile {
  return {
    enabled: row.enabled,
    id: row.id,
    is_global: row.isGlobal,
    name: row.name,
    rules: decodeReleaseProfileRules(row.rules),
  };
}

export function encodeReleaseProfileRules(rules: readonly ReleaseProfileRule[]) {
  return Schema.encodeSync(ReleaseProfileRulesJsonSchema)(rules.map((rule) => ({
    ...rule,
  })));
}

export function decodeReleaseProfileRules(value: string): ReleaseProfileRule[] {
  return [...Schema.decodeUnknownSync(ReleaseProfileRulesJsonSchema)(value)];
}

export function encodeConfigCore(core: ConfigCore): string {
  return Schema.encodeSync(ConfigCoreJsonSchema)({
    downloads: {
      ...core.downloads,
      preferred_groups: [...core.downloads.preferred_groups],
      remote_path_mappings: core.downloads.remote_path_mappings.map((mapping) => [
        ...mapping,
      ]),
    },
    general: { ...core.general },
    library: { ...core.library },
    nyaa: { ...core.nyaa },
    qbittorrent: { ...core.qbittorrent },
    scheduler: { ...core.scheduler },
    security: {
      ...core.security,
      auth_throttle: {
        ...core.security.auth_throttle,
        trusted_proxy_ips: [...core.security.auth_throttle.trusted_proxy_ips],
      },
    },
  });
}

export function decodeConfigCore(value: string): ConfigCore {
  const decoded = Schema.decodeUnknownSync(ConfigCoreJsonSchema)(value);

  return {
    downloads: {
      ...decoded.downloads,
      preferred_groups: [...decoded.downloads.preferred_groups],
      remote_path_mappings: decoded.downloads.remote_path_mappings.map((mapping) => [
        ...mapping,
      ]),
    },
    general: { ...decoded.general },
    library: { ...decoded.library },
    nyaa: { ...decoded.nyaa },
    qbittorrent: { ...decoded.qbittorrent },
    scheduler: { ...decoded.scheduler },
    security: {
      ...decoded.security,
      auth_throttle: {
        ...decoded.security.auth_throttle,
        trusted_proxy_ips: [...decoded.security.auth_throttle.trusted_proxy_ips],
      },
    },
  };
}

export function encodeStringList(values: readonly string[]) {
  return Schema.encodeSync(StringListJsonSchema)([...values]);
}

export function decodeStringList(value: string): string[] {
  return [...Schema.decodeUnknownSync(StringListJsonSchema)(value)];
}

export function encodeNumberList(values: readonly number[]) {
  return Schema.encodeSync(NumberListJsonSchema)([...values]);
}

export function decodeNumberList(value: string): number[] {
  return [...Schema.decodeUnknownSync(NumberListJsonSchema)(value)];
}

export function encodeOptionalNumberList(values: readonly number[]): string | null {
  const normalized = [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))]
    .sort((left, right) => left - right);

  return normalized.length > 0 ? encodeNumberList(normalized) : null;
}

export function decodeOptionalNumberList(value: string | null | undefined): number[] {
  if (!value) {
    return [];
  }

  try {
    return decodeNumberList(value);
  } catch {
    return [];
  }
}
