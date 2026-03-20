import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Context, Effect, Either, Layer, Schema, Stream } from "effect";
import { XMLParser } from "fast-xml-parser";
import ipaddr from "ipaddr.js";

import {
  ExternalCallError,
  tryExternalEffect,
} from "../../lib/effect-retry.ts";

class RssStreamReadError extends Schema.TaggedError<RssStreamReadError>()(
  "RssStreamReadError",
  { message: Schema.String },
) {}

class RssPayloadTooLargeError
  extends Schema.TaggedError<RssPayloadTooLargeError>()(
    "RssPayloadTooLargeError",
    { maxBytes: Schema.Number, actualBytes: Schema.Number },
  ) {}

class InvalidRedirectUrlError
  extends Schema.TaggedError<InvalidRedirectUrlError>()(
    "InvalidRedirectUrlError",
    { location: Schema.String },
  ) {}

class RssDnsLookupError extends Schema.TaggedError<RssDnsLookupError>()(
  "RssDnsLookupError",
  {
    cause: Schema.Defect,
    hostname: Schema.String,
    recordType: Schema.Literal("A", "AAAA"),
  },
) {}

export interface ParsedRelease {
  readonly group?: string;
  readonly infoHash: string;
  readonly isSeaDex: boolean;
  readonly isSeaDexBest: boolean;
  readonly seaDexComparison?: string;
  readonly seaDexDualAudio?: boolean;
  readonly seaDexNotes?: string;
  readonly seaDexReleaseGroup?: string;
  readonly seaDexTags?: readonly string[];
  readonly leechers: number;
  readonly magnet: string;
  readonly pubDate: string;
  readonly remake: boolean;
  readonly resolution?: string;
  readonly seeders: number;
  readonly size: string;
  readonly sizeBytes: number;
  readonly title: string;
  readonly trusted: boolean;
  readonly viewUrl: string;
}

interface RssClientShape {
  readonly fetchItems: (
    url: string,
  ) => Effect.Effect<readonly ParsedRelease[], ExternalCallError>;
}

export class RssClient extends Context.Tag("@bakarr/api/RssClient")<
  RssClient,
  RssClientShape
>() {}

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

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".internal",
  ".localhost",
  ".localdomain",
];
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
]);

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

const makeFetchItems = (client: HttpClient.HttpClient) =>
  Effect.fn("RssClient.fetchItems")(function* (url: string) {
    const parsedUrl = yield* Effect.sync(() => {
      try {
        return new URL(url);
      } catch {
        return null;
      }
    });

    if (!parsedUrl) {
      return [];
    }

    if (
      parsedUrl.protocol !== "http:" &&
      parsedUrl.protocol !== "https:"
    ) {
      return [];
    }

    if (!isAllowedPort(parsedUrl.port)) {
      return [];
    }

    const visitedUrls = new Set<string>();
    let currentUrl = url;

    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      if (visitedUrls.has(currentUrl)) {
        yield* Effect.logWarning("RSS feed rejected: redirect loop detected")
          .pipe(
            Effect.annotateLogs({ url: currentUrl, hop }),
          );
        return [];
      }
      visitedUrls.add(currentUrl);

      const validationResult = yield* validateUrlForSsrf(currentUrl);
      if (validationResult._tag === "Rejected") {
        yield* Effect.logWarning("RSS feed rejected by SSRF guardrail").pipe(
          Effect.annotateLogs({
            url: currentUrl,
            reason: validationResult.reason,
            hop,
          }),
        );
        return [];
      }

      const request = HttpClientRequest.get(currentUrl).pipe(
        HttpClientRequest.setHeader(
          "Accept",
          "application/rss+xml, application/xml, text/xml",
        ),
        HttpClientRequest.setHeader("User-Agent", "bakarr/1.0"),
      );

      const executeWithManualRedirect = <A, E, R>(
        effect: Effect.Effect<A, E, R>,
      ) =>
        Effect.serviceOption(FetchHttpClient.RequestInit).pipe(
          Effect.flatMap((requestInitOption) =>
            effect.pipe(
              Effect.provideService(
                FetchHttpClient.RequestInit,
                requestInitOption._tag === "Some"
                  ? { ...requestInitOption.value, redirect: "manual" }
                  : { redirect: "manual" },
              ),
            )
          ),
        );

      const response = yield* tryExternalEffect(
        "rss.fetch",
        executeWithManualRedirect(client.execute(request)),
      )();

      if (response.status >= 200 && response.status < 300) {
        const itemsResult = yield* Effect.either(readRssItems(response.stream));
        if (Either.isLeft(itemsResult)) {
          if (itemsResult.left.operation !== "rss.stream.size") {
            return yield* itemsResult.left;
          }
          yield* Effect.logWarning(
            "RSS feed rejected: payload size exceeded limit",
          ).pipe(
            Effect.annotateLogs({ url: currentUrl }),
          );
          return [];
        }
        return itemsResult.right;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers["location"];
        if (!location || typeof location !== "string") {
          return yield* ExternalCallError.make({
            cause: new Error(`Redirect without location header`),
            message:
              `RSS feed returned redirect ${response.status} without location`,
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

        if (
          redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:"
        ) {
          yield* Effect.logWarning(
            "RSS feed rejected: redirect to disallowed scheme",
          ).pipe(
            Effect.annotateLogs({
              url: currentUrl,
              redirectUrl: redirectUrl.href,
            }),
          );
          return [];
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
    return [];
  });

type SsrfValidationResult =
  | { _tag: "Accepted" }
  | { _tag: "Rejected"; reason: string };

const validateUrlForSsrf = (
  urlString: string,
): Effect.Effect<SsrfValidationResult, never, never> =>
  Effect.gen(function* () {
    const parseResult = yield* Effect.try({
      try: () => new URL(urlString),
      catch: () => ({
        _tag: "Rejected" as const,
        reason: "Invalid URL format",
      }),
    }).pipe(Effect.either);

    if (Either.isLeft(parseResult)) {
      return parseResult.left;
    }
    const parsedUrl = parseResult.right;

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

    const resolvedAddrs = yield* resolveFeedAddresses(hostname);

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
    const client = yield* HttpClient.HttpClient;

    return {
      fetchItems: makeFetchItems(client),
    } satisfies RssClientShape;
  }),
);

const MAX_RSS_BYTES = 10 * 1024 * 1024;

const readRssItems = Effect.fn("RssClient.readRssItems")(
  (body: Stream.Stream<Uint8Array, unknown>) => {
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let chunks = "";

    return body.pipe(
      Stream.mapError(() =>
        new RssStreamReadError({ message: "Failed to read RSS stream" })
      ),
      Stream.runForEach((chunk) => {
        totalBytes += chunk.byteLength;
        if (totalBytes > MAX_RSS_BYTES) {
          return Effect.fail(
            new RssPayloadTooLargeError({
              actualBytes: totalBytes,
              maxBytes: MAX_RSS_BYTES,
            }),
          );
        }
        chunks += decoder.decode(chunk, { stream: true });
        return Effect.void;
      }),
      Effect.map(() => parseRssXml(chunks)),
      Effect.mapError((error) => {
        if (error instanceof RssPayloadTooLargeError) {
          return ExternalCallError.make({
            cause: error,
            message:
              `RSS payload exceeded maximum size of ${MAX_RSS_BYTES} bytes`,
            operation: "rss.stream.size",
          });
        }
        return ExternalCallError.make({
          cause: error,
          message: "Failed to read RSS stream",
          operation: "rss.stream",
        });
      }),
    );
  },
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

class RssChannelSchema extends Schema.Class<RssChannelSchema>(
  "RssChannelSchema",
)({
  item: ItemsSchema,
}) {}

class RssRootInnerSchema extends Schema.Class<RssRootInnerSchema>(
  "RssRootInnerSchema",
)({
  channel: RssChannelSchema,
}) {}

class RssRootSchema extends Schema.Class<RssRootSchema>("RssRootSchema")({
  rss: RssRootInnerSchema,
}) {}

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

  return decoded.right.rss.channel.item.map((item) => parseRssItem(item));
}

function parseRssItem(
  item: Schema.Schema.Type<typeof RssItemSchema>,
): ParsedRelease {
  const title = item.title ?? "Unknown release";
  const link = item.link ?? "";
  const infoHash = item["nyaa:infoHash"] ?? randomHex(20);
  const groupMatch = title.match(/^\[(.*?)\]/);
  const size = item["nyaa:size"] ?? "0 B";
  const pubDate = item.pubDate ?? new Date().toISOString();
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
  };
}

function parseSizeToBytes(size: string): number {
  const match = size.match(/([0-9.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)/i);

  if (!match) {
    return 0;
  }

  const value = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multiplier = unit === "B"
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

function randomHex(bytes: number) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (v) => v.toString(16).padStart(2, "0")).join("");
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

const resolveFeedAddresses = Effect.fn("RssClient.resolveFeedAddresses")(
  function* (hostname: string) {
    const dns = Deno as unknown as {
      resolveDns: (name: string, type: "A" | "AAAA") => Promise<string[]>;
    };

    const aLookup = yield* Effect.tryPromise({
      try: () => dns.resolveDns(hostname, "A"),
      catch: (cause) =>
        new RssDnsLookupError({
          cause,
          hostname,
          recordType: "A",
        }),
    }).pipe(Effect.either);

    const aaaaLookup = yield* Effect.tryPromise({
      try: () => dns.resolveDns(hostname, "AAAA"),
      catch: (cause) =>
        new RssDnsLookupError({
          cause,
          hostname,
          recordType: "AAAA",
        }),
    }).pipe(Effect.either);

    if (
      (Either.isLeft(aLookup) && !isDnsNoRecordError(aLookup.left.cause)) ||
      (Either.isLeft(aaaaLookup) && !isDnsNoRecordError(aaaaLookup.left.cause))
    ) {
      return [];
    }

    const addresses: string[] = [];

    if (Either.isRight(aLookup)) {
      addresses.push(...aLookup.right);
    }
    if (Either.isRight(aaaaLookup)) {
      addresses.push(...aaaaLookup.right);
    }

    return addresses;
  },
);

function isDnsNoRecordError(cause: unknown): boolean {
  if (!(cause instanceof Error)) {
    return false;
  }

  const name = cause.name;
  const code = (cause as { code?: unknown }).code;
  const message = cause.message.toLowerCase();

  return name === "NotFound" ||
    code === "NotFound" ||
    code === "ENOTFOUND" ||
    code === "ENODATA" ||
    message.includes("not found") ||
    message.includes("enodata") ||
    message.includes("enotfound");
}
