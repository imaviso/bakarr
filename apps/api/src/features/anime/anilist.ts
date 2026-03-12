import { Context, Effect, Either, Layer, Schema } from "effect";

import type { AnimeSearchResult } from "../../../../../packages/shared/src/index.ts";
import { ExternalCallError, tryExternal } from "../../lib/effect-retry.ts";

export interface AnimeMetadata {
  id: number;
  malId?: number;
  title: {
    romaji: string;
    english?: string;
    native?: string;
  };
  format: string;
  description?: string;
  score?: number;
  genres?: string[];
  studios?: string[];
  coverImage?: string;
  bannerImage?: string;
  status: string;
  episodeCount?: number;
  startDate?: string;
  endDate?: string;
}

interface AniListClientShape {
  readonly searchAnimeMetadata: (
    query: string,
  ) => Effect.Effect<AnimeSearchResult[], never>;
  readonly getAnimeMetadataById: (
    id: number,
  ) => Effect.Effect<AnimeMetadata | null, never>;
}

export class AniListClient extends Context.Tag("@bakarr/api/AniListClient")<
  AniListClient,
  AniListClientShape
>() {}

const SAMPLE_ANIME: readonly AnimeMetadata[] = [
  {
    bannerImage:
      "https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-RSsE8k6xpk7L.jpg",
    coverImage:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-buvcRTBx4NS6.png",
    description:
      "A group of aspiring hunters challenge a deadly exam to chase their dreams.",
    episodeCount: 148,
    format: "TV",
    genres: ["Action", "Adventure", "Fantasy"],
    id: 11061,
    endDate: "2014-09-23",
    malId: 11061,
    score: 90,
    startDate: "2011-10-02",
    status: "FINISHED",
    studios: ["MADHOUSE"],
    title: {
      english: "Hunter x Hunter",
      native: "HUNTER x HUNTER",
      romaji: "Hunter x Hunter (2011)",
    },
  },
  {
    bannerImage:
      "https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-RSsE8k6xpk7L.jpg",
    coverImage:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20583-Gj8MGuJHYWvV.jpg",
    description:
      "A family of spies, assassins, and telepaths try to pass as ordinary.",
    episodeCount: 12,
    format: "TV",
    genres: ["Action", "Comedy", "Slice of Life"],
    id: 140960,
    malId: 50265,
    score: 84,
    startDate: "2022-04-09",
    status: "RELEASING",
    studios: ["WIT STUDIO", "CloverWorks"],
    title: {
      english: "SPY x FAMILY",
      native: "SPYxFAMILY",
      romaji: "SPY x FAMILY",
    },
  },
  {
    coverImage:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1535-df1v0A3qP2G2.jpg",
    description:
      "A young ninja vows to become the strongest leader of his village.",
    episodeCount: 220,
    format: "TV",
    genres: ["Action", "Adventure"],
    id: 20,
    endDate: "2007-02-08",
    malId: 20,
    score: 79,
    startDate: "2002-10-03",
    status: "FINISHED",
    studios: ["Studio Pierrot"],
    title: {
      english: "Naruto",
      native: "NARUTO -ナルト-",
      romaji: "Naruto",
    },
  },
];

const ANILIST_URL = "https://graphql.anilist.co";

const AniListTitleSchema = Schema.Struct({
  english: Schema.optional(Schema.NullOr(Schema.String)),
  native: Schema.optional(Schema.NullOr(Schema.String)),
  romaji: Schema.optional(Schema.NullOr(Schema.String)),
});

const AniListDateSchema = Schema.Struct({
  day: Schema.optional(Schema.NullOr(Schema.Number)),
  month: Schema.optional(Schema.NullOr(Schema.Number)),
  year: Schema.optional(Schema.NullOr(Schema.Number)),
});

const AniListSearchMediaSchema = Schema.Struct({
  coverImage: Schema.optional(Schema.Struct({
    large: Schema.optional(Schema.NullOr(Schema.String)),
  })),
  episodes: Schema.optional(Schema.NullOr(Schema.Number)),
  format: Schema.optional(Schema.NullOr(Schema.String)),
  id: Schema.Number,
  status: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.optional(AniListTitleSchema),
});

const AniListSearchPayloadSchema = Schema.Struct({
  data: Schema.Struct({
    Page: Schema.Struct({
      media: Schema.Array(AniListSearchMediaSchema),
    }),
  }),
});

const AniListDetailMediaSchema = Schema.Struct({
  averageScore: Schema.optional(Schema.NullOr(Schema.Number)),
  bannerImage: Schema.optional(Schema.NullOr(Schema.String)),
  coverImage: Schema.optional(Schema.Struct({
    large: Schema.optional(Schema.NullOr(Schema.String)),
  })),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  endDate: Schema.optional(AniListDateSchema),
  episodes: Schema.optional(Schema.NullOr(Schema.Number)),
  format: Schema.optional(Schema.NullOr(Schema.String)),
  genres: Schema.optional(Schema.Array(Schema.String)),
  id: Schema.Number,
  idMal: Schema.optional(Schema.NullOr(Schema.Number)),
  startDate: Schema.optional(AniListDateSchema),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  studios: Schema.optional(Schema.Struct({
    nodes: Schema.Array(Schema.Struct({
      name: Schema.optional(Schema.NullOr(Schema.String)),
    })),
  })),
  title: Schema.optional(AniListTitleSchema),
});

const AniListDetailPayloadSchema = Schema.Struct({
  data: Schema.Struct({
    Media: Schema.optional(Schema.NullOr(AniListDetailMediaSchema)),
  }),
});

const searchAnimeMetadata = Effect.fn("AniListClient.searchAnimeMetadata")(
  function* (query: string) {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      return [];
    }

    const remote = yield* trySearchRemote(trimmed).pipe(
      Effect.catchAll(() => Effect.succeed<AnimeSearchResult[] | null>(null)),
    );

    if (remote) {
      return remote;
    }

    return fallbackSearch(trimmed);
  },
);

const getAnimeMetadataById = Effect.fn("AniListClient.getAnimeMetadataById")(
  function* (id: number) {
    const remote = yield* tryFetchDetail(id).pipe(
      Effect.catchAll(() =>
        Effect.succeed<AnimeMetadata | null | undefined>(undefined)
      ),
    );

    if (remote !== undefined) {
      return remote;
    }

    return SAMPLE_ANIME.find((entry) => entry.id === id) ?? null;
  },
);

export const AniListClientLive = Layer.succeed(
  AniListClient,
  {
    getAnimeMetadataById,
    searchAnimeMetadata,
  } satisfies AniListClientShape,
);

function trySearchRemote(trimmed: string) {
  return Effect.fn("AniListClient.trySearchRemote")(function* () {
    const response = yield* tryExternal(
      "anilist.search",
      (signal) =>
        fetch(ANILIST_URL, {
          body: JSON.stringify({
            query: `query ($search: String) {
        Page(page: 1, perPage: 10) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
            id
            format
            status
            episodes
            startDate {
              year
              month
              day
            }
            endDate {
              year
              month
              day
            }
            title {
              romaji
              english
              native
            }
            coverImage {
              large
            }
          }
        }
      }`,
            variables: { search: trimmed },
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal,
        }),
    )();

    if (!response.ok) {
      return yield* Effect.fail(
        ExternalCallError.make({
          cause: new Error(
            `AniList search failed with status ${response.status}`,
          ),
          message: "AniList search failed",
          operation: "anilist.search.response",
        }),
      );
    }

    const payload = yield* decodeJsonResponse(
      response,
      "anilist.search.json",
      AniListSearchPayloadSchema,
    );

    return payload.data.Page.media.map((entry) => ({
      already_in_library: false,
      cover_image: entry.coverImage?.large ?? undefined,
      episode_count: entry.episodes ?? undefined,
      format: entry.format ?? undefined,
      id: entry.id,
      status: entry.status ?? undefined,
      title: {
        english: entry.title?.english ?? undefined,
        native: entry.title?.native ?? undefined,
        romaji: entry.title?.romaji ?? undefined,
      },
    }));
  })();
}

function tryFetchDetail(id: number) {
  return Effect.fn("AniListClient.tryFetchDetail")(function* () {
    const response = yield* tryExternal(
      "anilist.detail",
      (signal) =>
        fetch(ANILIST_URL, {
          body: JSON.stringify({
            query: `query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          idMal
          format
          status
          episodes
          startDate {
            year
            month
            day
          }
          endDate {
            year
            month
            day
          }
          description(asHtml: false)
          averageScore
          genres
          title {
            romaji
            english
            native
          }
          coverImage {
            large
          }
          bannerImage
          studios(isMain: true) {
            nodes {
              name
            }
          }
        }
      }`,
            variables: { id },
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal,
        }),
    )();

    if (!response.ok) {
      return yield* Effect.fail(
        ExternalCallError.make({
          cause: new Error(
            `AniList detail failed with status ${response.status}`,
          ),
          message: "AniList detail failed",
          operation: "anilist.detail.response",
        }),
      );
    }

    const payload = yield* decodeJsonResponse(
      response,
      "anilist.detail.json",
      AniListDetailPayloadSchema,
    );
    const media = payload.data.Media;

    if (!media) {
      return null;
    }

    return {
      bannerImage: media.bannerImage ?? undefined,
      coverImage: media.coverImage?.large ?? undefined,
      description: media.description ?? undefined,
      endDate: toIsoDate(media.endDate),
      episodeCount: media.episodes ?? undefined,
      format: media.format ?? "TV",
      genres: [...(media.genres ?? [])],
      id: media.id,
      malId: media.idMal ?? undefined,
      score: media.averageScore ?? undefined,
      startDate: toIsoDate(media.startDate),
      status: media.status ?? "UNKNOWN",
      studios: Array.isArray(media.studios?.nodes)
        ? [...media.studios.nodes.map((entry) => entry.name).filter(isString)]
        : [],
      title: {
        english: media.title?.english ?? undefined,
        native: media.title?.native ?? undefined,
        romaji: media.title?.romaji ?? `Anime ${id}`,
      },
    } satisfies AnimeMetadata;
  })();
}

function decodeJsonResponse<A, I>(
  response: Response,
  operation: string,
  schema: Schema.Schema<A, I>,
) {
  return Effect.fn(`AniListClient.${operation}`)(function* () {
    const payload = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) =>
        ExternalCallError.make({
          cause,
          message: "Failed to decode AniList JSON response",
          operation,
        }),
    });

    const decoded = Schema.decodeUnknownEither(schema)(payload);

    if (Either.isLeft(decoded)) {
      return yield* Effect.fail(
        ExternalCallError.make({
          cause: decoded.left,
          message: "AniList response schema mismatch",
          operation,
        }),
      );
    }

    return decoded.right;
  })();
}

function fallbackSearch(trimmed: string) {
  const lower = trimmed.toLowerCase();

  return SAMPLE_ANIME.filter((entry) => {
    const candidates = [
      entry.title.romaji,
      entry.title.english,
      entry.title.native,
    ].filter(isString).map((value) => value.toLowerCase());
    return candidates.some((candidate) => candidate.includes(lower));
  }).map(toSearchResult);
}

function toIsoDate(
  date:
    | { year?: number | null; month?: number | null; day?: number | null }
    | undefined,
): string | undefined {
  if (!date?.year || !date?.month || !date?.day) {
    return undefined;
  }

  return `${String(date.year).padStart(4, "0")}-${
    String(date.month).padStart(2, "0")
  }-${String(date.day).padStart(2, "0")}`;
}

function toSearchResult(entry: AnimeMetadata): AnimeSearchResult {
  return {
    already_in_library: false,
    cover_image: entry.coverImage,
    episode_count: entry.episodeCount,
    format: entry.format,
    id: entry.id,
    status: entry.status,
    title: entry.title,
  };
}

function isString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
