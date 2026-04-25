import { Effect, Option } from "effect";
import ipaddr from "ipaddr.js";

import type { Config } from "@packages/shared/index.ts";
import { ConfigValidationError } from "@/features/system/errors.ts";

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
}

const PRIVATE_QBIT_IPV4_CIDRS: readonly [ipaddr.IPv4, number][] = [
  ipaddr.IPv4.parseCIDR("0.0.0.0/8"),
  ipaddr.IPv4.parseCIDR("10.0.0.0/8"),
  ipaddr.IPv4.parseCIDR("100.64.0.0/10"),
  ipaddr.IPv4.parseCIDR("127.0.0.0/8"),
  ipaddr.IPv4.parseCIDR("169.254.0.0/16"),
  ipaddr.IPv4.parseCIDR("172.16.0.0/12"),
  ipaddr.IPv4.parseCIDR("192.168.0.0/16"),
  ipaddr.IPv4.parseCIDR("198.18.0.0/15"),
];

const PRIVATE_QBIT_IPV6_CIDRS: readonly [ipaddr.IPv6, number][] = [
  ipaddr.IPv6.parseCIDR("fc00::/7"),
  ipaddr.IPv6.parseCIDR("fe80::/10"),
];

function isPrivateIpv4Address(ip: ipaddr.IPv4): boolean {
  for (const cidr of PRIVATE_QBIT_IPV4_CIDRS) {
    if (ip.match(cidr)) {
      return true;
    }
  }

  return false;
}

function isPrivateIpv6Address(ip: ipaddr.IPv6): boolean {
  if (ip.toString() === "::1") {
    return true;
  }

  if (ip.isIPv4MappedAddress()) {
    return isPrivateIpv4Address(ip.toIPv4Address());
  }

  for (const cidr of PRIVATE_QBIT_IPV6_CIDRS) {
    if (ip.match(cidr)) {
      return true;
    }
  }

  return false;
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

  return Option.getOrElse(
    Option.liftThrowable(() => {
      const parsed = ipaddr.parse(normalized);
      if (parsed instanceof ipaddr.IPv4) {
        return isPrivateIpv4Address(parsed);
      }
      return isPrivateIpv6Address(parsed);
    })(),
    () => false,
  );
}

const configValidationError = (message: string) => new ConfigValidationError({ message });

const parseUrl = (raw: string) =>
  Effect.try({
    try: () => new URL(raw.trim()),
    catch: (cause) =>
      new ConfigValidationError({
        cause,
        message: "qBittorrent URL is invalid",
      }),
  });

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
