import { Effect } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { ConfigValidationError } from "@/features/system/errors.ts";

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
}

function isPrivateQBitHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);

  if (
    normalized === "localhost" ||
    normalized === "ip6-localhost" ||
    normalized === "ip6-loopback"
  ) {
    return true;
  }

  if (normalized.endsWith(".localhost")) {
    return true;
  }

  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }

  const ipv4 = normalized.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
  if (ipv4) {
    const octets = normalized.split(".").map((part) => Number(part));

    if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
      return false;
    }

    const [first, second] = octets;

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && second >= 18 && second <= 19)
    );
  }

  if (normalized.startsWith("::ffff:")) {
    return isPrivateQBitHost(normalized.slice(7));
  }

  if (normalized.includes(":")) {
    return (
      normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)
    );
  }

  return false;
}

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

export const normalizeQBitTorrentConfig = Effect.fn("SystemConfig.normalizeQBitTorrentConfig")(
  function* (config: Config["qbittorrent"]) {
    const normalizedUrl = yield* Effect.try({
      try: () => normalizeBaseUrl(config.url),
      catch: (cause) =>
        new ConfigValidationError({
          message: cause instanceof Error ? cause.message : "qBittorrent URL is invalid",
        }),
    });
    const trustedLocal = config.trusted_local ?? true;
    const host = new URL(normalizedUrl).hostname;

    if (!trustedLocal && isPrivateQBitHost(host)) {
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

export const normalizeConfig = Effect.fn("SystemConfig.normalizeConfig")(function* (
  config: Config,
) {
  const qbittorrent = yield* normalizeQBitTorrentConfig(config.qbittorrent);

  return {
    ...config,
    qbittorrent,
  } satisfies Config;
});
