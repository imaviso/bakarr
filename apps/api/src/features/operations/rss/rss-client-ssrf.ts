import { isIP } from "node:net";

import { DnsResolver, isDnsNoRecordError } from "@/security/dns-resolver.ts";
import { parseUrlEffect } from "@/infra/url.ts";
import { RssFeedRejectedError } from "@/features/operations/errors.ts";
import { isPrivateIpString } from "@/security/private-host.ts";
import { Effect, Result } from "effect";

const ALLOWED_PORTS = new Set(["80", "443", ""]);
const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost", ".localdomain"];
const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

export type PinnedRequestTarget =
  | {
      readonly _tag: "Pinned";
      readonly parsedUrl: URL;
      readonly pinnedAddress: string;
      readonly pinnedAddressFamily: 4 | 6;
    }
  | {
      readonly _tag: "Unpinned";
      readonly parsedUrl: URL;
    };

export const resolvePinnedRequestTarget = Effect.fn("RssClient.resolvePinnedRequestTarget")(
  function* (urlString: string, dns: typeof DnsResolver.Service) {
    const parsedUrlResult = yield* parseUrlEffect(
      urlString,
      (cause) =>
        new RssFeedRejectedError({
          cause,
          message: "RSS feed URL format is invalid",
        }),
    ).pipe(Effect.result);

    if (Result.isFailure(parsedUrlResult)) {
      return yield* parsedUrlResult.failure;
    }

    const parsedUrl = parsedUrlResult.success;

    if (!isAllowedPort(parsedUrl.port)) {
      return yield* new RssFeedRejectedError({
        message: `Port ${parsedUrl.port} not allowed`,
      });
    }

    const hostname = normalizeHostname(parsedUrl.hostname);

    if (isBlockedHostname(hostname)) {
      return yield* new RssFeedRejectedError({
        message: `Hostname ${hostname} is blocked`,
      });
    }

    if (isIpLiteral(hostname)) {
      return yield* new RssFeedRejectedError({
        message: `IP-literal feed URLs are not allowed: ${hostname}`,
      });
    }

    const resolvedAddrs = yield* resolveFeedAddresses(hostname, dns);

    if (resolvedAddrs.length === 0) {
      return yield* new RssFeedRejectedError({
        message: `DNS resolution failed for ${hostname}`,
      });
    }

    for (const addr of resolvedAddrs) {
      if (isPrivateIpString(addr)) {
        return yield* new RssFeedRejectedError({
          message: `${hostname} resolves to private IP ${addr}`,
        });
      }
    }

    const [pinnedAddress] = resolvedAddrs;
    if (!pinnedAddress) {
      return yield* new RssFeedRejectedError({
        message: `DNS resolution failed for ${hostname}`,
      });
    }

    return {
      _tag: "Pinned",
      parsedUrl,
      pinnedAddress,
      pinnedAddressFamily: isIpv4Address(pinnedAddress) ? 4 : 6,
    } satisfies PinnedRequestTarget;
  },
);

/**
 * Creation-time feed URL guard: format, scheme, port, and static hostname checks only.
 * DNS resolution stays at fetch time — it is unsuitable when persisting a feed.
 */
export const validateFeedUrlStatic = Effect.fn("RssClient.validateFeedUrlStatic")(function* (
  urlString: string,
) {
  const parsedUrl = yield* parseUrlEffect(
    urlString,
    (cause) =>
      new RssFeedRejectedError({
        cause,
        message: "RSS feed URL is invalid",
      }),
  );

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return yield* new RssFeedRejectedError({
      message: `RSS feed URL uses a disallowed protocol: ${parsedUrl.protocol}`,
    });
  }

  if (!isAllowedPort(parsedUrl.port)) {
    return yield* new RssFeedRejectedError({
      message: `Port ${parsedUrl.port} not allowed`,
    });
  }

  const hostname = normalizeHostname(parsedUrl.hostname);

  if (isBlockedHostname(hostname)) {
    return yield* new RssFeedRejectedError({
      message: `Hostname ${hostname} is blocked`,
    });
  }

  if (isIpLiteral(hostname)) {
    return yield* new RssFeedRejectedError({
      message: `IP-literal feed URLs are not allowed: ${hostname}`,
    });
  }

  return undefined;
});

const resolveFeedAddresses = Effect.fn("RssClient.resolveFeedAddresses")(function* (
  hostname: string,
  dns: typeof DnsResolver.Service,
) {
  const [aLookup, aaaaLookup] = yield* Effect.all(
    [
      dns.resolve(hostname, "A").pipe(Effect.result),
      dns.resolve(hostname, "AAAA").pipe(Effect.result),
    ],
    { concurrency: 2 },
  );

  if (
    (Result.isFailure(aLookup) && !isDnsNoRecordError(aLookup.failure.cause)) ||
    (Result.isFailure(aaaaLookup) && !isDnsNoRecordError(aaaaLookup.failure.cause))
  ) {
    return yield* new RssFeedRejectedError({
      message: `DNS resolution failed for ${hostname}`,
    });
  }

  const addresses: string[] = [];

  if (Result.isSuccess(aLookup)) {
    addresses.push(...aLookup.success);
  }
  if (Result.isSuccess(aaaaLookup)) {
    addresses.push(...aaaaLookup.success);
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
  return hostname
    .toLowerCase()
    .replace(/^\[([^\]]+)\]$/, "$1")
    .replace(/\.$/, "");
}

function isIpLiteral(hostname: string) {
  return isIP(hostname) !== 0;
}

function isIpv4Address(addr: string) {
  return isIP(addr) === 4;
}
