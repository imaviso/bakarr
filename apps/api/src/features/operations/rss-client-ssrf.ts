import { Effect, Either } from "effect";
import ipaddr from "ipaddr.js";

import { DnsResolver, isDnsNoRecordError } from "../../lib/dns-resolver.ts";
import { RssFeedRejectedError } from "./errors.ts";

const PRIVATE_IPV4_CIDRS: readonly [ipaddr.IPv4, number][] = [
  ipaddr.IPv4.parseCIDR("10.0.0.0/8"),
  ipaddr.IPv4.parseCIDR("172.16.0.0/12"),
  ipaddr.IPv4.parseCIDR("192.168.0.0/16"),
  ipaddr.IPv4.parseCIDR("127.0.0.0/8"),
  ipaddr.IPv4.parseCIDR("169.254.0.0/16"),
  ipaddr.IPv4.parseCIDR("0.0.0.0/8"),
  ipaddr.IPv4.parseCIDR("100.64.0.0/10"),
];

const PRIVATE_IPV6_CIDRS: readonly [ipaddr.IPv6, number][] = [
  ipaddr.IPv6.parseCIDR("fc00::/7"),
  ipaddr.IPv6.parseCIDR("fe80::/10"),
];

const ALLOWED_PORTS = new Set(["80", "443", ""]);
const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost", ".localdomain"];
const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

export type UrlValidationResult =
  | { readonly _tag: "Accepted" }
  | { readonly _tag: "Rejected"; readonly reason: string };

export const validateUrlForSsrf = Effect.fn("RssClient.validateUrlForSsrf")(function* (
  urlString: string,
  dns: typeof DnsResolver.Service,
) {
  const parsedUrlResult = yield* Effect.try({
    try: () => new URL(urlString),
    catch: () =>
      new RssFeedRejectedError({
        message: "RSS feed URL format is invalid",
      }),
  }).pipe(Effect.either);

  if (Either.isLeft(parsedUrlResult)) {
    return {
      _tag: "Rejected" as const,
      reason: parsedUrlResult.left.message,
    };
  }

  const parsedUrl = parsedUrlResult.right;

  if (!isAllowedPort(parsedUrl.port)) {
    return {
      _tag: "Rejected" as const,
      reason: `Port ${parsedUrl.port} not allowed`,
    };
  }

  const hostname = normalizeHostname(parsedUrl.hostname);

  if (isBlockedHostname(hostname)) {
    return {
      _tag: "Rejected" as const,
      reason: `Hostname ${hostname} is blocked`,
    };
  }

  if (isIpLiteral(hostname)) {
    if (isPrivateIpAddress(hostname)) {
      return {
        _tag: "Rejected" as const,
        reason: `IP ${hostname} is private/reserved`,
      };
    }

    return { _tag: "Accepted" as const };
  }

  const resolvedAddrsResult = yield* Effect.either(resolveFeedAddresses(hostname, dns));

  if (Either.isLeft(resolvedAddrsResult)) {
    return {
      _tag: "Rejected" as const,
      reason: resolvedAddrsResult.left.message,
    };
  }

  const resolvedAddrs = resolvedAddrsResult.right;

  if (resolvedAddrs.length === 0) {
    return {
      _tag: "Rejected" as const,
      reason: `DNS resolution failed for ${hostname}`,
    };
  }

  for (const addr of resolvedAddrs) {
    if (isPrivateIpAddress(addr)) {
      return {
        _tag: "Rejected" as const,
        reason: `${hostname} resolves to private IP ${addr}`,
      };
    }
  }

  return { _tag: "Accepted" as const };
});

const resolveFeedAddresses = Effect.fn("RssClient.resolveFeedAddresses")(function* (
  hostname: string,
  dns: typeof DnsResolver.Service,
) {
  const [aLookup, aaaaLookup] = yield* Effect.all(
    [
      dns.resolve(hostname, "A").pipe(Effect.either),
      dns.resolve(hostname, "AAAA").pipe(Effect.either),
    ],
    { concurrency: 2 },
  );

  if (
    (Either.isLeft(aLookup) && !isDnsNoRecordError(aLookup.left.cause)) ||
    (Either.isLeft(aaaaLookup) && !isDnsNoRecordError(aaaaLookup.left.cause))
  ) {
    return yield* new RssFeedRejectedError({
      message: `DNS resolution failed for ${hostname}`,
    });
  }

  const addresses: string[] = [];

  if (Either.isRight(aLookup)) {
    addresses.push(...aLookup.right);
  }
  if (Either.isRight(aaaaLookup)) {
    addresses.push(...aaaaLookup.right);
  }

  return addresses;
});

function isAllowedPort(port: string): boolean {
  return ALLOWED_PORTS.has(port);
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(normalized)) {
    return true;
  }

  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      return true;
    }
  }

  return false;
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function isIpLiteral(hostname: string) {
  try {
    ipaddr.parse(hostname);
    return true;
  } catch {
    return false;
  }
}

function isPrivateIpAddress(addr: string): boolean {
  try {
    const parsed = ipaddr.parse(addr);
    const kind = parsed.kind();

    if (kind === "ipv4") {
      return isPrivateIpv4Address(parsed as ipaddr.IPv4);
    }

    return isPrivateIpv6Address(parsed as ipaddr.IPv6);
  } catch {
    return false;
  }
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
  if (ip.toString() === "::1" || ip.toString() === "::") {
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
