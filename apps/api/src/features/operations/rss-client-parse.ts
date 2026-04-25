import { ParseResult, Schema, Effect, Option, Stream } from "effect";
import { XMLParser } from "fast-xml-parser";

import { collectBoundedText } from "@/domain/bounded-stream.ts";
import { RssFeedParseError, RssFeedTooLargeError } from "@/features/operations/errors.ts";
import { MAX_RSS_BYTES } from "@/features/operations/rss-limits.ts";
import { parseResolution } from "@/features/operations/release-ranking.ts";

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

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

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
  item: Schema.optional(ItemsSchema),
}) {}

class RssRootInnerSchema extends Schema.Class<RssRootInnerSchema>("RssRootInnerSchema")({
  channel: RssChannelSchema,
}) {}

class RssRootSchema extends Schema.Class<RssRootSchema>("RssRootSchema")({
  rss: RssRootInnerSchema,
}) {}

const ParsedReleaseFromRssItemSchema = Schema.transformOrFail(RssItemSchema, ParsedReleaseSchema, {
  decode: (item) => {
    const { title } = item;
    const { link } = item;
    const infoHash = item["nyaa:infoHash"];
    const size = item["nyaa:size"];
    const { pubDate } = item;
    const seeders = parseCount(item["nyaa:seeders"]);
    const leechers = parseCount(item["nyaa:leechers"]);
    const trusted = parseYesNo(item["nyaa:trusted"]);
    const remake = parseYesNo(item["nyaa:remake"]);

    if (!title || !link || !infoHash || !size || !pubDate) {
      return Effect.fail(
        new ParseResult.Type(ParsedReleaseSchema.ast, item, "RSS item is missing required fields"),
      );
    }

    if (
      Option.isNone(seeders) ||
      Option.isNone(leechers) ||
      Option.isNone(trusted) ||
      Option.isNone(remake)
    ) {
      return Effect.fail(
        new ParseResult.Type(
          ParsedReleaseSchema.ast,
          item,
          "RSS item contains invalid numeric or boolean fields",
        ),
      );
    }

    const sizeBytes = parseSizeToBytes(size);

    if (Option.isNone(sizeBytes)) {
      return Effect.fail(
        new ParseResult.Type(
          ParsedReleaseSchema.ast,
          item,
          "RSS item contains an invalid size field",
        ),
      );
    }

    const groupMatch = title.match(/^\[(.*?)\]/);

    return Effect.succeed({
      group: groupMatch?.[1],
      infoHash,
      isSeaDex: false,
      isSeaDexBest: false,
      leechers: leechers.value,
      magnet: `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`,
      pubDate,
      remake: remake.value,
      resolution: parseResolution(title),
      seeders: seeders.value,
      size,
      sizeBytes: sizeBytes.value,
      title,
      trusted: trusted.value,
      viewUrl: link.replace("/download/", "/view/").replace(/\.torrent$/i, ""),
    } satisfies ParsedRelease);
  },
  encode: (release) =>
    Effect.succeed({
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

export const readRssItems = Effect.fn("RssClient.readRssItems")(function* (
  body: Stream.Stream<Uint8Array, unknown>,
) {
  const text = yield* collectBoundedText(body, MAX_RSS_BYTES).pipe(
    Effect.mapError(
      (cause) =>
        new RssFeedTooLargeError({
          cause,
          message: `RSS payload exceeded maximum size of ${MAX_RSS_BYTES} bytes`,
        }),
    ),
  );

  return yield* readInlineRssItems(text);
});

const readInlineRssItems = Effect.fn("RssClient.readInlineRssItems")(function* (text: string) {
  if (Buffer.byteLength(text, "utf8") > MAX_RSS_BYTES) {
    return yield* new RssFeedTooLargeError({
      message: `RSS payload exceeded maximum size of ${MAX_RSS_BYTES} bytes`,
    });
  }

  return yield* parseRssXml(text);
});

const parseRssXml = Effect.fn("RssClient.parseRssXml")(function* (xml: string) {
  const parsed = yield* Effect.try({
    try: () => xmlParser.parse(xml),
    catch: (cause) =>
      new RssFeedParseError({
        cause,
        message: "RSS feed XML could not be parsed",
      }),
  });

  const decoded = yield* Schema.decodeUnknown(RssRootSchema)(parsed).pipe(
    Effect.mapError(
      (cause) =>
        new RssFeedParseError({
          cause,
          message: "RSS feed payload did not match the expected schema",
        }),
    ),
  );

  const items = decoded.rss.channel.item ?? [];

  return yield* Effect.forEach(items, (item) =>
    Schema.decodeUnknown(ParsedReleaseFromRssItemSchema)(item).pipe(
      Effect.mapError(
        (cause) =>
          new RssFeedParseError({
            cause,
            message: "RSS feed item payload was invalid",
          }),
      ),
    ),
  );
});

function parseSizeToBytes(size: string): Option.Option<number> {
  const match = size.match(/([0-9.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)/i);

  if (!match) {
    return Option.none();
  }

  const valueRaw = match[1];
  const unitRaw = match[2];

  if (!valueRaw || !unitRaw) {
    return Option.none();
  }

  const value = Number.parseFloat(valueRaw);
  const unit = unitRaw.toUpperCase();
  let multiplier = 1024 ** 4;

  if (unit === "B") {
    multiplier = 1;
  } else if (unit === "KIB" || unit === "KB") {
    multiplier = 1024;
  } else if (unit === "MIB" || unit === "MB") {
    multiplier = 1024 ** 2;
  } else if (unit === "GIB" || unit === "GB") {
    multiplier = 1024 ** 3;
  }

  return Option.some(Math.round(value * multiplier));
}

function parseCount(value: string | undefined): Option.Option<number> {
  if (value === undefined) {
    return Option.none();
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? Option.none() : Option.some(parsed);
}

function parseYesNo(value: string | undefined): Option.Option<boolean> {
  if (value === undefined) {
    return Option.none();
  }

  if (/^yes$/i.test(value)) {
    return Option.some(true);
  }

  if (/^no$/i.test(value)) {
    return Option.some(false);
  }

  return Option.none();
}
