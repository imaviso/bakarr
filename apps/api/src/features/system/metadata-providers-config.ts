import { Effect } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { ConfigValidationError } from "@/features/system/errors.ts";

export const DEFAULT_ANIDB_METADATA_CONFIG = {
  client: "bakarr",
  client_version: 1,
  enabled: false,
  episode_limit: 200,
  local_port: 45553,
  password: null,
  username: null,
} as const;

export const normalizeMetadataProvidersConfig = Effect.fn(
  "SystemConfig.normalizeMetadataProvidersConfig",
)(function* (metadata: Config["metadata"] | undefined) {
  const normalized = normalizeAniDbConfig(metadata?.anidb);

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

  if (!Number.isInteger(normalized.client_version) || normalized.client_version <= 0) {
    return yield* new ConfigValidationError({
      message: "AniDB client version must be a positive integer",
    });
  }

  if (
    !Number.isInteger(normalized.local_port) ||
    normalized.local_port <= 1024 ||
    normalized.local_port > 65535
  ) {
    return yield* new ConfigValidationError({
      message: "AniDB local port must be an integer between 1025 and 65535",
    });
  }

  if (!Number.isInteger(normalized.episode_limit) || normalized.episode_limit <= 0) {
    return yield* new ConfigValidationError({
      message: "AniDB episode limit must be a positive integer",
    });
  }

  return {
    anidb: normalized,
  } satisfies NonNullable<Config["metadata"]>;
});

type AniDbMetadataConfig = NonNullable<NonNullable<Config["metadata"]>["anidb"]>;

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
