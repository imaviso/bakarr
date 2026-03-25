import { FetchHttpClient, HttpClient, HttpClientRequest } from "@effect/platform";
import { Context, Effect, Either, Layer, Schema, Stream } from "effect";
import { XMLParser } from "fast-xml-parser";
import ipaddr from "ipaddr.js";

import { collectBoundedText } from "../../lib/bounded-stream.ts";
import { DnsResolver, isDnsNoRecordError } from "../../lib/dns-resolver.ts";
import { ExternalCallError, tryExternalEffect } from "../../lib/effect-retry.ts";
import { RssFeedRejectedError, RssFeedTooLargeError } from "./errors.ts";

export { RssFeedRejectedError, RssFeedTooLargeError } from "./errors.ts";

class InvalidRedirectUrlError extends Schema.TaggedError<InvalidRedirectUrlError>()(
  "InvalidRedirectUrlError",
  { location: Schema.String },
) {}

export const ParsedReleaseSchema = Schema.Struct({
  group: Schema.optional(Schema.String),
  infoHash: Schema.String,
  isSeaDex: Schema.Boolean,
  isSeaDexBest: Schema.Boolean,
  leechers: Schema.Number,
  magnet: Schema.String,
  pubDate: Schema.String,
  remake: Schema.Boolean,
  resolution: Schema.optional(Schema.String),
  seaDexComparison: Schema.optional(Schema.String),
  seaDexDualAudio: Schema.optional(Schema.Boolean),
  seaDexNotes: Schema.optional(Schema.String),
  seaDexReleaseGroup: Schema.optional(Schema.String),
  seaDexTags: Schema.optional(Schema.Array(Schema.String)),
  seeders: Schema.Number,
  size: Schema.String,
  sizeBytes: Schema.Number,
  title: Schema.String,
  trusted: Schema.Boolean,
  viewUrl: Schema.String,
});

export type ParsedRelease = Schema.Schema.Type<typeof ParsedReleaseSchema>;

interface RssClientShape {
  readonly fetchItems: (
    url: string,
  ) => Effect.Effect<
    readonly ParsedRelease[],
    ExternalCallError | RssFeedRejectedError | RssFeedTooLargeError
  >;
}

export class RssClient extends Context.Tag("@bakarr/api/RssClient")<RssClient, RssClientShape>() {}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

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

const MAX_REDIRECT_HOPS = 5;

const ALLOWED_PORTS = new Set(["80", "443", ""]);

const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost", ".localdomain"];
const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

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

const makeFetchItems = (client: HttpClient.HttpClient, dns: typeof DnsResolver.Service) =>
  Effect.fn("RssClient.fetchItems")(function* (url: string) {
    const parsedUrl = yield* Effect.try({
      try: () => new URL(url),
      catch: () =>
        new RssFeedRejectedError({
          message: `RSS feed URL is invalid: ${url}`,
        }),
    });

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return yield* new RssFeedRejectedError({
        message: `RSS feed URL uses a disallowed protocol: ${parsedUrl.protocol}`,
      });
    }

    if (!isAllowedPort(parsedUrl.port)) {
      return yield* new RssFeedRejectedError({
        message: `RSS feed URL uses a disallowed port: ${parsedUrl.port}`,
      });
    }

    const visitedUrls = new Set<string>();
    let currentUrl = url;

    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      if (visitedUrls.has(currentUrl)) {
        yield* Effect.logWarning("RSS feed rejected: redirect loop detected").pipe(
          Effect.annotateLogs({ url: currentUrl, hop }),
        );
        return yield* new RssFeedRejectedError({
          message: "RSS feed rejected: redirect loop detected",
        });
      }
      visitedUrls.add(currentUrl);

      const validationResult = yield* validateUrlForSsrf(currentUrl, dns);
      if (validationResult._tag === "Rejected") {
        yield* Effect.logWarning("RSS feed rejected by SSRF guardrail").pipe(
          Effect.annotateLogs({
            url: currentUrl,
            reason: validationResult.reason,
            hop,
          }),
        );
        return yield* new RssFeedRejectedError({
          message: validationResult.reason,
        });
      }

      const request = HttpClientRequest.get(currentUrl).pipe(
        HttpClientRequest.setHeader("Accept", "application/rss+xml, application/xml, text/xml"),
        HttpClientRequest.setHeader("User-Agent", "bakarr/1.0"),
      );

      const response = yield* tryExternalEffect("rss.fetch", client.execute(request))();

      if (response.status >= 200 && response.status < 300) {
        const itemsResult = yield* Effect.either(readRssItems(response.stream));
        if (Either.isLeft(itemsResult)) {
          yield* Effect.logWarning(itemsResult.left.message).pipe(
            Effect.annotateLogs({ url: currentUrl }),
          );
          return yield* itemsResult.left;
        }
        return itemsResult.right;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers["location"];
        if (!location || typeof location !== "string") {
          return yield* ExternalCallError.make({
            cause: new Error(`Redirect without location header`),
            message: `RSS feed returned redirect ${response.status} without location`,
            operation: "rss.fetch.redirect",
          });
        }

        const redirectResult = yield* Effect.try({
          try: () => new URL(location, currentUrl),
          catch: () => new InvalidRedirectUrlError({ location }),
        }).pipe(Effect.either);

        if (Either.isLeft(redirectResult)) {
          return yield* ExternalCallError.make({
            cause: redirectResult.left,
            message: `RSS feed returned invalid redirect URL`,
            operation: "rss.fetch.redirect",
          });
        }

        const redirectUrl = redirectResult.right;

        if (redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:") {
          yield* Effect.logWarning("RSS feed rejected: redirect to disallowed scheme").pipe(
            Effect.annotateLogs({
              url: currentUrl,
              redirectUrl: redirectUrl.href,
            }),
          );
          return yield* new RssFeedRejectedError({
            message: `RSS feed redirect uses a disallowed protocol: ${redirectUrl.protocol}`,
          });
        }

        currentUrl = redirectUrl.href;
        continue;
      }

      return yield* ExternalCallError.make({
        cause: new Error(`RSS feed returned HTTP ${response.status}`),
        message: `RSS feed returned HTTP ${response.status}`,
        operation: "rss.fetch.status",
      });
    }

    yield* Effect.logWarning("RSS feed rejected: too many redirects").pipe(
      Effect.annotateLogs({ url, redirectCount: MAX_REDIRECT_HOPS }),
    );
    return yield* new RssFeedRejectedError({
      message: "RSS feed rejected: too many redirects",
    });
  });

type SsrfValidationResult = { _tag: "Accepted" } | { _tag: "Rejected"; reason: string };

const validateUrlForSsrf = (
  urlString: string,
  dns: typeof DnsResolver.Service,
): Effect.Effect<SsrfValidationResult, never, never> =>
  Effect.gen(function* () {
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

export const RssClientLive = Layer.effect(
  RssClient,
  Effect.gen(function* () {
    const baseClient = yield* HttpClient.HttpClient;
    const dns = yield* DnsResolver;

    // Configure redirect: "manual" once at the layer boundary so the RSS
    // client handles redirects explicitly (SSRF validation on each hop).
    const client = baseClient.pipe(
      HttpClient.transformResponse(
        Effect.provideService(FetchHttpClient.RequestInit, {
          redirect: "manual",
        }),
      ),
    );

    return {
      fetchItems: makeFetchItems(client, dns),
    } satisfies RssClientShape;
  }),
);

const MAX_RSS_BYTES = 10 * 1024 * 1024;

const readRssItems = Effect.fn("RssClient.readRssItems")(
  (body: Stream.Stream<Uint8Array, unknown>) =>
    collectBoundedText(body, MAX_RSS_BYTES).pipe(
      Effect.map(parseRssXml),
      Effect.mapError(
        () =>
          new RssFeedTooLargeError({
            message: `RSS payload exceeded maximum size of ${MAX_RSS_BYTES} bytes`,
          }),
      ),
    ),
);

class RssItemSchema extends Schema.Class<RssItemSchema>("RssItemSchema")({
  title: Schema.optional(Schema.String),
  link: Schema.optional(Schema.String),
  "nyaa:infoHash": Schema.optional(Schema.String),
  "nyaa:size": Schema.optional(Schema.String),
  "nyaa:seeders": Schema.optional(Schema.String),
  "nyaa:leechers": Schema.optional(Schema.String),
  "nyaa:trusted": Schema.optional(Schema.String),
  "nyaa:remake": Schema.optional(Schema.String),
  pubDate: Schema.optional(Schema.String),
}) {}

const ItemsSchema = Schema.transform(
  Schema.Union(Schema.Array(RssItemSchema), RssItemSchema),
  Schema.Array(RssItemSchema),
  {
    decode: (value) => (Array.isArray(value) ? value : [value]),
    encode: (value) => value,
  },
);

class RssChannelSchema extends Schema.Class<RssChannelSchema>("RssChannelSchema")({
  item: ItemsSchema,
}) {}

class RssRootInnerSchema extends Schema.Class<RssRootInnerSchema>("RssRootInnerSchema")({
  channel: RssChannelSchema,
}) {}

class RssRootSchema extends Schema.Class<RssRootSchema>("RssRootSchema")({
  rss: RssRootInnerSchema,
}) {}

const ParsedReleaseFromRssItemSchema = Schema.transform(RssItemSchema, ParsedReleaseSchema, {
  decode: (item) => {
    const title = item.title ?? "Unknown release";
    const link = item.link ?? "";
    const infoHash = item["nyaa:infoHash"] ?? fallbackInfoHash(title, link);
    const groupMatch = title.match(/^\[(.*?)\]/);
    const size = item["nyaa:size"] ?? "0 B";
    const pubDate = item.pubDate ?? "1970-01-01T00:00:00.000Z";
    const seeders = Number.parseInt(item["nyaa:seeders"] ?? "0", 10) || 0;
    const leechers = Number.parseInt(item["nyaa:leechers"] ?? "0", 10) || 0;
    const trusted = /^yes$/i.test(item["nyaa:trusted"] ?? "no");
    const remake = /^yes$/i.test(item["nyaa:remake"] ?? "no");

    return {
      group: groupMatch?.[1],
      infoHash,
      isSeaDex: false,
      isSeaDexBest: false,
      leechers,
      magnet: `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`,
      pubDate,
      remake,
      resolution: parseResolution(title),
      seeders,
      size,
      sizeBytes: parseSizeToBytes(size),
      title,
      trusted,
      viewUrl: link.replace("/download/", "/view/").replace(/\.torrent$/i, ""),
    } satisfies ParsedRelease;
  },
  encode: (release) => ({
    link: release.viewUrl.replace("/view/", "/download/") + ".torrent",
    pubDate: release.pubDate,
    title: release.title,
    "nyaa:infoHash": release.infoHash,
    "nyaa:leechers": String(release.leechers),
    "nyaa:remake": release.remake ? "Yes" : "No",
    "nyaa:seeders": String(release.seeders),
    "nyaa:size": release.size,
    "nyaa:trusted": release.trusted ? "Yes" : "No",
  }),
});

function parseRssXml(xml: string): ParsedRelease[] {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch {
    return [];
  }

  const decoded = Schema.decodeUnknownEither(RssRootSchema)(parsed);

  if (decoded._tag === "Left") {
    return [];
  }

  return decoded.right.rss.channel.item.map((item) =>
    Schema.decodeSync(ParsedReleaseFromRssItemSchema)(item),
  );
}

function parseSizeToBytes(size: string): number {
  const match = size.match(/([0-9.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)/i);

  if (!match) {
    return 0;
  }

  const value = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multiplier =
    unit === "B"
      ? 1
      : unit === "KIB" || unit === "KB"
        ? 1024
        : unit === "MIB" || unit === "MB"
          ? 1024 ** 2
          : unit === "GIB" || unit === "GB"
            ? 1024 ** 3
            : 1024 ** 4;

  return Math.round(value * multiplier);
}

function parseResolution(value: string) {
  const match = value.match(/(480p|720p|1080p|2160p)/i);
  return match?.[1]?.toLowerCase();
}

function fallbackInfoHash(title: string, link: string): string {
  const source = `${title}|${link}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  const hex = hash.toString(16).padStart(8, "0");
  return hex.repeat(5).slice(0, 40);
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
