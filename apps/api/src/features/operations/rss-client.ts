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
      parsedUrl.protocol !== "https:" &&
      parsedUrl.protocol !== "data:"
    ) {
      return [];
    }

    if (parsedUrl.protocol !== "data:") {
      if (
        parsedUrl.port && parsedUrl.port !== "80" &&
        parsedUrl.port !== "443"
      ) {
        return [];
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal")
      ) {
        return [];
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
