import { isIP } from "node:net";

interface IpRange {
  readonly network: bigint;
  readonly mask: bigint;
}

const IPV4_BIT_LENGTH = 32n;
const IPV6_BIT_LENGTH = 128n;

function ipv4Mask(prefix: number): bigint {
  return prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << (IPV4_BIT_LENGTH - BigInt(prefix));
}

function ipv6Mask(prefix: number): bigint {
  return prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << (IPV6_BIT_LENGTH - BigInt(prefix));
}

function privateIpv4(network: string, prefix: number): IpRange {
  return { network: parseIpv4(network) & ipv4Mask(prefix), mask: ipv4Mask(prefix) };
}

function privateIpv6(network: string, prefix: number): IpRange {
  return { network: parseIpv6(network) & ipv6Mask(prefix), mask: ipv6Mask(prefix) };
}

const PRIVATE_IPV4_RANGES: readonly IpRange[] = [
  privateIpv4("0.0.0.0", 8),
  privateIpv4("10.0.0.0", 8),
  privateIpv4("100.64.0.0", 10),
  privateIpv4("127.0.0.0", 8),
  privateIpv4("169.254.0.0", 16),
  privateIpv4("172.16.0.0", 12),
  privateIpv4("192.168.0.0", 16),
  privateIpv4("198.18.0.0", 15),
];

const PRIVATE_IPV6_RANGES: readonly IpRange[] = [
  privateIpv6("fc00::", 7),
  privateIpv6("fe80::", 10),
];

/**
 * Strict dotted-quad to 32-bit value. Only called on strings that passed
 * `isIP` (which rejects hex/octal/leading-zero forms), so parsing is exact.
 */
function parseIpv4(addr: string): bigint {
  const [a, b, c, d] = addr.split(".");
  return (BigInt(a!) << 24n) | (BigInt(b!) << 16n) | (BigInt(c!) << 8n) | BigInt(d!);
}

/**
 * IPv6 textual form to 128-bit value. Only called on strings that passed
 * `isIP`, so the compression and embedded-IPv4 invariants below hold.
 */
function parseIpv6(addr: string): bigint {
  let head = addr;

  const lastColon = addr.lastIndexOf(":");
  if (addr.indexOf(".") !== -1) {
    const [a, b, c, d] = addr.slice(lastColon + 1).split(".");
    const low = ((BigInt(a!) << 8n) | BigInt(b!)).toString(16).padStart(4, "0");
    const high = ((BigInt(c!) << 8n) | BigInt(d!)).toString(16).padStart(4, "0");
    head = `${addr.slice(0, lastColon + 1)}${low}:${high}`;
  }

  const sections = head.split("::");
  let groups: readonly string[];
  if (sections.length === 2) {
    const left = sections[0] ? sections[0].split(":") : [];
    const right = sections[1] ? sections[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  } else {
    groups = head.split(":");
  }

  let value = 0n;
  for (const group of groups) {
    value = (value << 16n) | BigInt(Number.parseInt(group, 16));
  }
  return value;
}

function matchesAnyRange(value: bigint, ranges: readonly IpRange[]): boolean {
  return ranges.some((range) => (value & range.mask) === range.network);
}

function isPrivateIpv4(addr: string): boolean {
  return matchesAnyRange(parseIpv4(addr), PRIVATE_IPV4_RANGES);
}

function isPrivateIpv6(addr: string): boolean {
  const value = parseIpv6(addr);
  if (value === 0n || value === 1n) {
    return true;
  }

  // IPv4-mapped (`::ffff:0:0/96`): first 80 bits zero, next 16 bits 0xffff.
  // Matches ipaddr.js `isIPv4MappedAddress` (words[0..4]==0 && words[5]==0xffff).
  if (value >> 48n === 0n && ((value >> 32n) & 0xffffn) === 0xffffn) {
    return matchesAnyRange(value & 0xffffffffn, PRIVATE_IPV4_RANGES);
  }

  return matchesAnyRange(value, PRIVATE_IPV6_RANGES);
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[([^\]]+)\]$/, "$1")
    .replace(/\.$/, "");
}

export function isPrivateIpString(addr: string): boolean {
  const kind = isIP(addr);
  if (kind === 4) {
    return isPrivateIpv4(addr);
  }
  if (kind === 6) {
    return isPrivateIpv6(addr);
  }
  return false;
}

/**
 * SSRF boundary helper: reports whether a hostname literal targets loopback,
 * private, link-local, or benchmark-range addresses. Shared by the qBittorrent
 * URL guard and the RSS feed URL schema. DNS rebinding is handled at fetch
 * time via DnsResolver pinning in `rss-client-ssrf.ts` — this sync check is
 * only the creation-time static guard (see `rss-client-ssrf.ts:validateFeedUrlStatic`).
 *
 * Note: liberal IPv4 textual forms accepted by some resolvers (hex, octal,
 * dword) are not treated as IP literals here. The RSS path is still safe —
 * such hostnames fall through to DNS resolution and every resolved address is
 * re-checked with `isPrivateIpString`.
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

  return isPrivateIpString(normalized);
}

/** Sync convenience for schema filters; malformed URLs are not private. */
export function httpUrlTargetsPrivateHost(url: string): boolean {
  try {
    return hostnameIsPrivate(new URL(url).hostname);
  } catch {
    return false;
  }
}
