import ipaddr from "ipaddr.js";

const PRIVATE_IPV4_CIDRS: readonly [ipaddr.IPv4, number][] = [
  ipaddr.IPv4.parseCIDR("0.0.0.0/8"),
  ipaddr.IPv4.parseCIDR("10.0.0.0/8"),
  ipaddr.IPv4.parseCIDR("100.64.0.0/10"),
  ipaddr.IPv4.parseCIDR("127.0.0.0/8"),
  ipaddr.IPv4.parseCIDR("169.254.0.0/16"),
  ipaddr.IPv4.parseCIDR("172.16.0.0/12"),
  ipaddr.IPv4.parseCIDR("192.168.0.0/16"),
  ipaddr.IPv4.parseCIDR("198.18.0.0/15"),
];

const PRIVATE_IPV6_CIDRS: readonly [ipaddr.IPv6, number][] = [
  ipaddr.IPv6.parseCIDR("fc00::/7"),
  ipaddr.IPv6.parseCIDR("fe80::/10"),
];

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
}

function isPrivateIpv4Address(ip: ipaddr.IPv4): boolean {
  for (const cidr of PRIVATE_IPV4_CIDRS) {
    if (ip.match(cidr)) {
      return true;
    }
  }

  return false;
}

function isPrivateIpv6Address(ip: ipaddr.IPv6): boolean {
  const str = ip.toString();
  if (str === "::1" || str === "::") {
    return true;
  }

  if (ip.isIPv4MappedAddress()) {
    return isPrivateIpv4Address(ip.toIPv4Address());
  }

  for (const cidr of PRIVATE_IPV6_CIDRS) {
    if (ip.match(cidr)) {
      return true;
    }
  }

  return false;
}

export function isPrivateIpString(addr: string): boolean {
  try {
    const parsed = ipaddr.parse(addr);
    if (parsed instanceof ipaddr.IPv4) {
      return isPrivateIpv4Address(parsed);
    }
    return isPrivateIpv6Address(parsed);
  } catch {
    return false;
  }
}

/**
 * SSRF boundary helper: reports whether a hostname literal targets loopback,
 * private, link-local, or benchmark-range addresses. Shared by the qBittorrent
 * URL guard and the RSS feed URL schema. DNS rebinding is handled at fetch
 * time via DnsResolver pinning in `rss-client-ssrf.ts` — this sync check is
 * only the creation-time static guard (see `rss-client-ssrf.ts:validateFeedUrlStatic`).
 */
export function hostnameIsPrivate(hostname: string): boolean {
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

  try {
    const parsed = ipaddr.parse(normalized);

    if (parsed instanceof ipaddr.IPv4) {
      return isPrivateIpv4Address(parsed);
    }

    return isPrivateIpv6Address(parsed);
  } catch {
    return false;
  }
}

/** Sync convenience for schema filters; malformed URLs are not private. */
export function httpUrlTargetsPrivateHost(url: string): boolean {
  try {
    return hostnameIsPrivate(new URL(url).hostname);
  } catch {
    return false;
  }
}
