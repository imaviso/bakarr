import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { Context, Effect, Either, Layer, Schema } from "effect";

import type { AnimeSearchResult } from "../../../../../packages/shared/src/index.ts";
import {
  ExternalCallError,
  tryExternalEffect,
} from "../../lib/effect-retry.ts";

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
  ) => Effect.Effect<AnimeSearchResult[], ExternalCallError>;
  readonly getAnimeMetadataById: (
    id: number,
  ) => Effect.Effect<AnimeMetadata | null, ExternalCallError>;
}

export class AniListClient extends Context.Tag("@bakarr/api/AniListClient")<
  AniListClient,
  AniListClientShape
>() {}

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
    extraLarge: Schema.optional(Schema.NullOr(Schema.String)),
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
    extraLarge: Schema.optional(Schema.NullOr(Schema.String)),
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

export const AniListClientLive = Layer.effect(
  AniListClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const searchAnimeMetadata = Effect.fn("AniListClient.searchAnimeMetadata")(
      function* (query: string) {
        const trimmed = query.trim();

        if (trimmed.length === 0) {
          return [];
        }

        return yield* trySearchRemote(client, trimmed);
      },
    );

    const getAnimeMetadataById = Effect.fn(
      "AniListClient.getAnimeMetadataById",
    )(
      function* (id: number) {
        return yield* tryFetchDetail(client, id);
      },
    );

    return {
      getAnimeMetadataById,
      searchAnimeMetadata,
    } satisfies AniListClientShape;
  }),
);

const trySearchRemote = Effect.fn("AniListClient.trySearchRemote")(
  function* (client: HttpClient.HttpClient, trimmed: string) {
    const request = HttpClientRequest.post(ANILIST_URL).pipe(
      HttpClientRequest.setHeader("Content-Type", "application/json"),
      HttpClientRequest.bodyUnsafeJson({
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
              extraLarge
              large
            }
          }
        }
      }`,
        variables: { search: trimmed },
      }),
    );
    const response = yield* tryExternalEffect(
      "anilist.search",
      client.execute(request),
    )();

    if (response.status < 200 || response.status >= 300) {
      return yield* ExternalCallError.make({
        cause: new Error(
          `AniList search failed with status ${response.status}`,
        ),
        message: "AniList search failed",
        operation: "anilist.search.response",
      });
    }

    const payload = yield* decodeJsonResponse(
      response,
      "anilist.search.json",
      AniListSearchPayloadSchema,
    );

    return payload.data.Page.media.map((entry) => ({
      already_in_library: false,
      cover_image: entry.coverImage?.extraLarge ?? entry.coverImage?.large ??
        undefined,
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
  },
);

const tryFetchDetail = Effect.fn("AniListClient.tryFetchDetail")(
  function* (client: HttpClient.HttpClient, id: number) {
    const request = HttpClientRequest.post(ANILIST_URL).pipe(
      HttpClientRequest.setHeader("Content-Type", "application/json"),
      HttpClientRequest.bodyUnsafeJson({
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
    );
    const response = yield* tryExternalEffect(
      "anilist.detail",
      client.execute(request),
    )();

    if (response.status < 200 || response.status >= 300) {
      return yield* ExternalCallError.make({
        cause: new Error(
          `AniList detail failed with status ${response.status}`,
        ),
        message: "AniList detail failed",
        operation: "anilist.detail.response",
      });
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
      coverImage: media.coverImage?.extraLarge ?? media.coverImage?.large ??
        undefined,
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
  },
);

function decodeJsonResponse<A, I>(
  response: HttpClientResponse.HttpClientResponse,
  operation: string,
  schema: Schema.Schema<A, I>,
) {
  return Effect.gen(function* () {
    const payload = yield* response.json.pipe(
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: "Failed to decode AniList JSON response",
          operation,
        })
      ),
    );

    const decoded = Schema.decodeUnknownEither(schema)(payload);

    if (Either.isLeft(decoded)) {
      return yield* ExternalCallError.make({
        cause: decoded.left,
        message: "AniList response schema mismatch",
        operation,
      });
    }

    return decoded.right;
  }).pipe(Effect.withSpan(`AniListClient.${operation}`));
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

function isString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
