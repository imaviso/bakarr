import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { ConfigValidationError } from "./errors.ts";

function normalizeBaseUrl(raw: string): string {
  const parsed = new URL(raw.trim());

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("qBittorrent URL must use http or https");
  }

  if (parsed.username || parsed.password) {
    throw new Error("qBittorrent URL must not include credentials");
  }

  if (parsed.search || parsed.hash) {
    throw new Error("qBittorrent URL must not include query or fragment");
  }

  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
}

export const normalizeQBitTorrentConfig = Effect.fn(
  "SystemConfig.normalizeQBitTorrentConfig",
)(function* (config: Config["qbittorrent"]) {
  const normalizedUrl = yield* Effect.try({
    try: () => normalizeBaseUrl(config.url),
    catch: (cause) =>
      new ConfigValidationError({
        message:
          cause instanceof Error ? cause.message : "qBittorrent URL is invalid",
      }),
  });

  return {
    ...config,
    url: normalizedUrl,
  } satisfies Config["qbittorrent"];
});

export const normalizeConfig = Effect.fn("SystemConfig.normalizeConfig")(function* (
  config: Config,
) {
  const qbittorrent = yield* normalizeQBitTorrentConfig(config.qbittorrent);

  return {
    ...config,
    qbittorrent,
  } satisfies Config;
});
