import { Effect } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { normalizeMetadataProvidersConfig } from "@/features/system/metadata-providers-config.ts";
import { normalizeQBitTorrentConfig } from "@/features/system/qbittorrent-config.ts";

export const normalizeConfig = Effect.fn("SystemConfig.normalizeConfig")(function* (
  config: Config,
) {
  const qbittorrent = yield* normalizeQBitTorrentConfig(config.qbittorrent);
  const metadata = yield* normalizeMetadataProvidersConfig(config.metadata);

  return {
    ...config,
    metadata,
    qbittorrent,
  } satisfies Config;
});
