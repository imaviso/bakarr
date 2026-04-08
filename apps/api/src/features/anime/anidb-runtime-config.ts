import type { Config } from "@packages/shared/index.ts";
import { DEFAULT_ANIDB_METADATA_CONFIG } from "@/features/system/metadata-providers-config.ts";

export interface AniDbRuntimeConfig {
  readonly enabled: boolean;
  readonly username: string | null;
  readonly password: string | null;
  readonly client: string;
  readonly clientVersion: number;
  readonly episodeLimit: number;
  readonly localPort: number;
}

export function resolveAniDbRuntimeConfig(config: Config): AniDbRuntimeConfig {
  const anidb = config.metadata?.anidb;

  return {
    enabled: anidb?.enabled ?? false,
    username: normalizeNullableString(anidb?.username),
    password: normalizeNullableString(anidb?.password),
    client: normalizeClientName(anidb?.client),
    clientVersion: normalizePositiveInt(
      anidb?.client_version,
      DEFAULT_ANIDB_METADATA_CONFIG.client_version,
    ),
    episodeLimit: normalizePositiveInt(
      anidb?.episode_limit,
      DEFAULT_ANIDB_METADATA_CONFIG.episode_limit,
    ),
    localPort: normalizeLocalPort(anidb?.local_port),
  };
}

export function normalizeEpisodeCount(
  episodeCount: number | undefined,
  episodeLimit: number,
): number | undefined {
  if (!Number.isFinite(episodeCount) || episodeCount === undefined) {
    return undefined;
  }

  const normalized = Math.floor(episodeCount);

  if (normalized <= 0) {
    return undefined;
  }

  return Math.min(normalized, episodeLimit);
}

function normalizeNullableString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeClientName(value: string | null | undefined) {
  if (typeof value !== "string") {
    return DEFAULT_ANIDB_METADATA_CONFIG.client;
  }

  const normalized = value.trim().toLowerCase();
  return /^[a-z]{4,16}$/.test(normalized) ? normalized : DEFAULT_ANIDB_METADATA_CONFIG.client;
}

function normalizePositiveInt(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeLocalPort(value: number | undefined) {
  if (typeof value === "number" && Number.isInteger(value) && value > 1024 && value <= 65535) {
    return value;
  }

  return DEFAULT_ANIDB_METADATA_CONFIG.local_port;
}
