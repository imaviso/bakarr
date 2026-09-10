import type { Config } from "@packages/shared/index.ts";
import { ConfigValidationError } from "@/features/system/errors.ts";
import { Effect } from "effect";

export const DEFAULT_ANIDB_METADATA_CONFIG: AniDbMetadataConfig = {
  client: "bakarr",
  client_version: 1,
  enabled: false,
  episode_limit: 200,
  local_port: 45553,
  password: null,
  username: null,
};

// AniList enforces ~90 requests/minute per IP; the cap keeps library
// refreshes and user searches under that. Applies live, no restart needed.
export const DEFAULT_ANILIST_REQUESTS_PER_MINUTE = 30;
export const MAX_ANILIST_REQUESTS_PER_MINUTE = 90;

export const DEFAULT_ANILIST_METADATA_CONFIG: AniListMetadataConfig = {
  requests_per_minute: DEFAULT_ANILIST_REQUESTS_PER_MINUTE,
};

export const normalizeMetadataProvidersConfig = Effect.fn(
  "SystemConfig.normalizeMetadataProvidersConfig",
)(function* (metadata: Config["metadata"] | undefined) {
  const normalized = normalizeAniDbConfig(metadata?.anidb);
  const anilist = normalizeAniListConfig(metadata?.anilist);

  if (normalized.enabled && (!normalized.username || !normalized.password)) {
    return yield* new ConfigValidationError({
      message: "AniDB metadata requires username and password when enabled",
    });
  }

  if (!/^[a-z]{4,16}$/.test(normalized.client)) {
    return yield* new ConfigValidationError({
      message: "AniDB client must use 4-16 lowercase letters",
    });
  }

  if (!globalThis.Number.isInteger(normalized.client_version) || normalized.client_version <= 0) {
    return yield* new ConfigValidationError({
      message: "AniDB client version must be a positive integer",
    });
  }

  if (
    !globalThis.Number.isInteger(normalized.local_port) ||
    normalized.local_port <= 1024 ||
    normalized.local_port > 65535
  ) {
    return yield* new ConfigValidationError({
      message: "AniDB local port must be an integer between 1025 and 65535",
    });
  }

  if (!globalThis.Number.isInteger(normalized.episode_limit) || normalized.episode_limit <= 0) {
    return yield* new ConfigValidationError({
      message: "AniDB episode limit must be a positive integer",
    });
  }

  if (
    !globalThis.Number.isInteger(anilist.requests_per_minute) ||
    anilist.requests_per_minute <= 0 ||
    anilist.requests_per_minute > MAX_ANILIST_REQUESTS_PER_MINUTE
  ) {
    return yield* new ConfigValidationError({
      message: `AniList requests per minute must be an integer between 1 and ${MAX_ANILIST_REQUESTS_PER_MINUTE}`,
    });
  }

  return {
    anidb: normalized,
    anilist,
  } satisfies NonNullable<Config["metadata"]>;
});

type AniDbMetadataConfig = NonNullable<NonNullable<Config["metadata"]>["anidb"]>;
type AniListMetadataConfig = NonNullable<NonNullable<Config["metadata"]>["anilist"]>;

function normalizeAniListConfig(anilist: Partial<AniListMetadataConfig> | undefined) {
  return {
    requests_per_minute: anilist?.requests_per_minute ?? DEFAULT_ANILIST_REQUESTS_PER_MINUTE,
  };
}

function normalizeAniDbConfig(anidb: Partial<AniDbMetadataConfig> | undefined) {
  return {
    client: (anidb?.client ?? DEFAULT_ANIDB_METADATA_CONFIG.client).trim().toLowerCase(),
    client_version: anidb?.client_version ?? DEFAULT_ANIDB_METADATA_CONFIG.client_version,
    enabled: anidb?.enabled ?? DEFAULT_ANIDB_METADATA_CONFIG.enabled,
    episode_limit: anidb?.episode_limit ?? DEFAULT_ANIDB_METADATA_CONFIG.episode_limit,
    local_port: anidb?.local_port ?? DEFAULT_ANIDB_METADATA_CONFIG.local_port,
    password: normalizeNullableString(anidb?.password),
    username: normalizeNullableString(anidb?.username),
  };
}

function normalizeNullableString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
