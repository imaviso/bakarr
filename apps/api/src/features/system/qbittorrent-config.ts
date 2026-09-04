import type { Config } from "@packages/shared/index.ts";
import { ConfigValidationError } from "@/features/system/errors.ts";
import { hostnameIsPrivate } from "@/security/private-host.ts";
import { parseUrlEffect } from "@/infra/url.ts";
import { Effect } from "effect";

const configValidationError = (message: string) => new ConfigValidationError({ message });

const parseUrl = (raw: string) =>
  parseUrlEffect(
    raw.trim(),
    (cause) =>
      new ConfigValidationError({
        cause,
        message: "qBittorrent URL is invalid",
      }),
  );

const normalizeBaseUrl = Effect.fn("SystemConfig.normalizeQBitTorrentBaseUrl")(function* (
  raw: string,
) {
  const parsed = yield* parseUrl(raw);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return yield* configValidationError("qBittorrent URL must use http or https");
  }

  if (parsed.username || parsed.password) {
    return yield* configValidationError("qBittorrent URL must not include credentials");
  }

  if (parsed.search || parsed.hash) {
    return yield* configValidationError("qBittorrent URL must not include query or fragment");
  }

  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
});

export const normalizeQBitTorrentConfig = Effect.fn("SystemConfig.normalizeQBitTorrentConfig")(
  function* (config: Config["qbittorrent"]) {
    const normalizedUrl = yield* normalizeBaseUrl(config.url);
    const trustedLocal = config.trusted_local ?? true;
    const host = new URL(normalizedUrl).hostname;

    if (!trustedLocal && hostnameIsPrivate(host)) {
      return yield* new ConfigValidationError({
        message:
          "qBittorrent URL must not target loopback, private, or link-local hosts unless trusted_local is enabled",
      });
    }

    return {
      ...config,
      trusted_local: trustedLocal,
      url: normalizedUrl,
    } satisfies Config["qbittorrent"];
  },
);
