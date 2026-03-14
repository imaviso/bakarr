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
  readonly fetchItems: (
    url: string,
  ) => Effect.Effect<readonly ParsedRelease[], never>;
}

export class RssClient extends Context.Tag("@bakarr/api/RssClient")<
  RssClient,
  RssClientShape
>() {}

const fetchItems = Effect.fn("RssClient.fetchItems")(function* (url: string) {
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

  const response = yield* tryExternal("rss.fetch", (signal) =>
    fetch(url, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal,
    }))().pipe(Effect.catchAll(() => Effect.succeed<Response | null>(null)));

  if (!response || !response.ok || !response.body) {
    return [];
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  const releases: ParsedRelease[] = [];

  yield* Effect.promise(async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      let startIndex = 0;

      while (true) {
        const itemStart = buffer.indexOf("<item>", startIndex);
        if (itemStart === -1) break;

        const itemEnd = buffer.indexOf("</item>", itemStart);
        if (itemEnd === -1) break;

        const itemXml = buffer.slice(itemStart + 6, itemEnd);

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
        ) ||
          0;
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
        const magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${
          encodeURIComponent(title)
        }`;

        releases.push({
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
          viewUrl: link.replace("/download/", "/view/").replace(
            /\.torrent$/i,
            "",
          ),
        });

        startIndex = itemEnd + 7;
      }

      buffer = buffer.slice(startIndex);
      const nextItemStart = buffer.lastIndexOf("<item>");
      if (nextItemStart === -1) {
        buffer = buffer.length > 20 ? buffer.slice(-20) : buffer;
      } else {
        buffer = buffer.slice(nextItemStart);
      }
    }
  });

  return releases;
});

export const RssClientLive = Layer.succeed(
  RssClient,
  { fetchItems } satisfies RssClientShape,
);

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
