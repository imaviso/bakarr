import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Chunk, Context, Effect, Layer, Schema, Stream } from "effect";

import {
  ExternalCallError,
  tryExternalEffect,
} from "../../lib/effect-retry.ts";

class RssStreamReadError extends Schema.TaggedError<RssStreamReadError>()(
  "RssStreamReadError",
  { message: Schema.String },
) {}

export interface ParsedRelease {
  readonly group?: string;
  readonly infoHash: string;
  readonly isSeaDex: boolean;
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

    if (
      parsedUrl.port && parsedUrl.port !== "80" &&
      parsedUrl.port !== "443"
    ) {
      return [];
    }

    const hostname = normalizeHostname(parsedUrl.hostname);
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return [];
    }

    if (isIpLiteral(hostname)) {
      if (isPrivateIpAddress(hostname)) {
        return [];
      }
    } else {
      const resolvedAddrs = yield* Effect.promise(() =>
        resolveFeedAddresses(hostname)
      );

      if (resolvedAddrs.length === 0) {
        return [];
      }

      for (const addr of resolvedAddrs) {
        if (isPrivateIpAddress(addr)) {
          return [];
        }
      }
    }

    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeader(
        "Accept",
        "application/rss+xml, application/xml, text/xml",
      ),
    );
    const response = yield* tryExternalEffect(
      "rss.fetch",
      client.execute(request),
    )();

    if (response.status < 200 || response.status >= 300) {
      return yield* ExternalCallError.make({
        cause: new Error(`RSS feed returned HTTP ${response.status}`),
        message: `RSS feed returned HTTP ${response.status}`,
        operation: "rss.fetch.status",
      });
    }

    return yield* readRssItems(response.stream);
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

const readRssItems = Effect.fn("RssClient.readRssItems")(
  (body: Stream.Stream<Uint8Array, unknown>) => {
    const decoder = new TextDecoder();

    return body.pipe(
      Stream.mapError(() =>
        new RssStreamReadError({ message: "Failed to read RSS stream" })
      ),
      Stream.map((chunk) => decoder.decode(chunk, { stream: true })),
      Stream.mapAccum("", (buffer, chunk) => extractItems(`${buffer}${chunk}`)),
      Stream.mapConcat(Chunk.toReadonlyArray),
      Stream.runCollect,
      Effect.map((chunks) =>
        chunks.pipe(Chunk.toReadonlyArray).map(parseReleaseItem)
      ),
      Effect.mapError((error) =>
        ExternalCallError.make({
          cause: error,
          message: "Failed to read RSS stream",
          operation: "rss.stream",
        })
      ),
    );
  },
);

function extractItems(buffer: string): readonly [string, Chunk.Chunk<string>] {
  let remaining = buffer;
  let cursor = 0;
  const items: string[] = [];

  while (true) {
    const itemStart = remaining.indexOf("<item>", cursor);

    if (itemStart === -1) {
      break;
    }

    const itemEnd = remaining.indexOf("</item>", itemStart);

    if (itemEnd === -1) {
      break;
    }

    items.push(remaining.slice(itemStart + 6, itemEnd));
    cursor = itemEnd + 7;
  }

  remaining = remaining.slice(cursor);
  const nextItemStart = remaining.lastIndexOf("<item>");

  if (nextItemStart === -1) {
    remaining = remaining.length > 20 ? remaining.slice(-20) : remaining;
  } else {
    remaining = remaining.slice(nextItemStart);
  }

  return [remaining, Chunk.fromIterable(items)];
}

function parseReleaseItem(itemXml: string): ParsedRelease {
  const title = decodeXml(
    extractTag(itemXml, "title") ?? "Unknown release",
  );
  const link = decodeXml(extractTag(itemXml, "link") ?? "");
  const infoHash = decodeXml(
    extractTag(itemXml, "nyaa:infoHash") ?? randomHex(20),
  );
  const groupMatch = title.match(/^\[(.*?)\]/);
  const size = decodeXml(extractTag(itemXml, "nyaa:size") ?? "0 B");
  const pubDate = decodeXml(extractTag(itemXml, "pubDate") ?? nowIso());
  const seeders = Number.parseInt(
    decodeXml(extractTag(itemXml, "nyaa:seeders") ?? "0"),
    10,
  ) || 0;
  const leechers = Number.parseInt(
    decodeXml(extractTag(itemXml, "nyaa:leechers") ?? "0"),
    10,
  ) || 0;
  const trusted = /^yes$/i.test(
    decodeXml(extractTag(itemXml, "nyaa:trusted") ?? "no"),
  );
  const remake = /^yes$/i.test(
    decodeXml(extractTag(itemXml, "nyaa:remake") ?? "no"),
  );

  return {
    group: groupMatch?.[1],
    infoHash,
    isSeaDex: /seadex/i.test(title) || /subsplease/i.test(title),
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

function extractTag(input: string, tag: string) {
  const match = input.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1];
}

function decodeXml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
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
  return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function isIpLiteral(hostname: string) {
  return isIpv4Literal(hostname) || isIpv6Literal(hostname);
}

function isIpv4Literal(hostname: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function isIpv6Literal(hostname: string) {
  return hostname.includes(":");
}

function isPrivateIpAddress(addr: string) {
  return isPrivateIpv4(addr) || isPrivateIpv6(addr);
}

async function resolveFeedAddresses(hostname: string): Promise<string[]> {
  const dns = Deno as unknown as {
    resolveDns: (name: string, type: "A" | "AAAA") => Promise<string[]>;
  };
  const lookups = await Promise.allSettled([
    dns.resolveDns(hostname, "A"),
    dns.resolveDns(hostname, "AAAA"),
  ]);
  const addresses: string[] = [];
  let hadLookupFailure = false;

  for (const lookup of lookups) {
    if (lookup.status === "fulfilled") {
      addresses.push(...lookup.value);
      continue;
    }

    if (!isNoRecordDnsError(lookup.reason)) {
      hadLookupFailure = true;
    }
  }

  return hadLookupFailure || addresses.length === 0 ? [] : addresses;
}

function isNoRecordDnsError(error: unknown) {
  return error instanceof Deno.errors.NotFound ||
    (error instanceof Error &&
      /no data|no records|not found|nxdomain/i.test(error.message));
}

function isPrivateIpv4(addr: string): boolean {
  const parts = addr.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  return (
    parts[0] === 0 ||
    parts[0] === 127 ||
    parts[0] === 10 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254)
  );
}

function isPrivateIpv6(addr: string): boolean {
  const normalized = addr.toLowerCase().split("%")[0];

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice("::ffff:".length));
  }

  const segments = expandIpv6(normalized);

  if (!segments) {
    return false;
  }

  const first = Number.parseInt(segments[0], 16);

  if (Number.isNaN(first)) {
    return false;
  }

  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

function expandIpv6(addr: string): string[] | null {
  if (addr.includes(".")) {
    return null;
  }

  const sections = addr.split("::");

  if (sections.length > 2) {
    return null;
  }

  const head = sections[0] ? sections[0].split(":") : [];
  const tail = sections[1] ? sections[1].split(":") : [];

  if (
    head.some((part) => !isIpv6Hextet(part)) ||
    tail.some((part) => !isIpv6Hextet(part))
  ) {
    return null;
  }

  const fillCount = 8 - head.length - tail.length;

  if ((sections.length === 1 && fillCount !== 0) || fillCount < 0) {
    return null;
  }

  return [...head, ...Array(fillCount).fill("0"), ...tail].map((part) =>
    part.padStart(4, "0")
  );
}

function isIpv6Hextet(part: string) {
  return /^[0-9a-f]{1,4}$/i.test(part);
}
