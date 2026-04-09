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
  const anidb = config.metadata?.anidb ?? DEFAULT_ANIDB_METADATA_CONFIG;

  return {
    enabled: anidb.enabled,
    username: anidb.username ?? null,
    password: anidb.password ?? null,
    client: anidb.client,
    clientVersion: anidb.client_version,
    episodeLimit: anidb.episode_limit,
    localPort: anidb.local_port,
  };
}

export function normalizeEpisodeCount(
  episodeCount: number | undefined,
  episodeLimit: number,
): number {
  if (!Number.isFinite(episodeCount) || episodeCount === undefined) {
    return episodeLimit;
  }

  const normalized = Math.floor(episodeCount);

  if (normalized <= 0) {
    return episodeLimit;
  }

  return Math.min(normalized, episodeLimit);
}
