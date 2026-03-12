import { Context, Effect, Layer } from "effect";

import { tryExternal } from "../../lib/effect-retry.ts";

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
  readonly fetchItems: (url: string) => Effect.Effect<readonly ParsedRelease[], never>;
}

export class RssClient extends Context.Tag("@bakarr/api/RssClient")<
  RssClient,
  RssClientShape
>() {}

const fetchItems = Effect.fn("RssClient.fetchItems")(function* (url: string) {
  const response = yield* tryExternal("rss.fetch", (signal) =>
    fetch(url, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal,
    })
  )().pipe(Effect.catchAll(() => Effect.succeed<Response | null>(null)));

  if (!response || !response.ok) {
    return [];
  }

  const text = yield* Effect.tryPromise({
    try: () => response.text(),
    catch: () => new Error("Failed to read RSS response body"),
  }).pipe(Effect.catchAll(() => Effect.succeed("")));

  if (text.length === 0) {
    return [];
  }

  const items = Array.from(
    text.matchAll(/<item>([\s\S]*?)<\/item>/g),
    (match) => match[1],
  );

  return items.map((item) => {
    const title = decodeXml(extractTag(item, "title") ?? "Unknown release");
    const link = decodeXml(extractTag(item, "link") ?? "");
    const infoHash = decodeXml(extractTag(item, "nyaa:infoHash") ?? randomHex(20));
    const groupMatch = title.match(/^\[(.*?)\]/);
    const size = decodeXml(extractTag(item, "nyaa:size") ?? "0 B");
    const pubDate = decodeXml(extractTag(item, "pubDate") ?? nowIso());
    const seeders = Number.parseInt(decodeXml(extractTag(item, "nyaa:seeders") ?? "0"), 10) || 0;
    const leechers = Number.parseInt(
      decodeXml(extractTag(item, "nyaa:leechers") ?? "0"),
      10,
    ) || 0;
    const trusted = /^yes$/i.test(decodeXml(extractTag(item, "nyaa:trusted") ?? "no"));
    const remake = /^yes$/i.test(decodeXml(extractTag(item, "nyaa:remake") ?? "no"));
    const magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`;

    return {
      group: groupMatch?.[1],
      infoHash,
      isSeaDex: /seadex/i.test(title) || /subsplease/i.test(title),
      leechers,
      magnet,
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
  });
});

export const RssClientLive = Layer.succeed(RssClient, { fetchItems } satisfies RssClientShape);

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
