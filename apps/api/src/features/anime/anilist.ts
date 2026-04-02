import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer, Option, Schema } from "effect";

import type { AnimeSearchResult } from "@packages/shared/index.ts";
import { ClockService } from "@/lib/clock.ts";
import { ExternalCallError, makeTryExternalEffect } from "@/lib/effect-retry.ts";
import {
  AnimeMetadataFromAniListSchema,
  AnimeSearchResultFromAniListSchema,
  AniListDetailPayloadSchema,
  AniListSearchPayloadSchema,
  type AnimeMetadata,
} from "@/features/anime/anilist-model.ts";

const ANILIST_URL = "https://graphql.anilist.co";

const SEARCH_ANIME_QUERY = `query ($search: String) {
  Page(page: 1, perPage: 10) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      format
      status
      episodes
      description(asHtml: false)
      genres
      synonyms
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
      bannerImage
      relations {
        edges {
          relationType
          node {
            id
            format
            status
            averageScore
            startDate {
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
      }
      recommendations(perPage: 6, sort: RATING_DESC) {
        nodes {
          mediaRecommendation {
            id
            format
            status
            averageScore
            startDate {
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
      }
    }
  }
}`;

const DETAIL_ANIME_QUERY = `query ($id: Int) {
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
    synonyms
    nextAiringEpisode {
      episode
      airingAt
    }
    airingSchedule(notYetAired: true, perPage: 32) {
      nodes {
        episode
        airingAt
      }
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
    bannerImage
    studios(isMain: true) {
      nodes {
        name
      }
    }
    relations {
      edges {
        relationType
        node {
          id
          format
          status
          averageScore
          startDate {
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
    }
    recommendations(perPage: 8, sort: RATING_DESC) {
      nodes {
        mediaRecommendation {
          id
          format
          status
          averageScore
          startDate {
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
    }
  }
}`;

interface AniListClientShape {
  readonly searchAnimeMetadata: (
    query: string,
  ) => Effect.Effect<AnimeSearchResult[], ExternalCallError>;
  readonly getAnimeMetadataById: (
    id: number,
  ) => Effect.Effect<Option.Option<AnimeMetadata>, ExternalCallError>;
}

export class AniListClient extends Context.Tag("@bakarr/api/AniListClient")<
  AniListClient,
  AniListClientShape
>() {}

export const AniListClientLive = Layer.effect(
  AniListClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const clock = yield* ClockService;
    const tryExternalEffect = makeTryExternalEffect(clock);

    const searchAnimeMetadata = Effect.fn("AniListClient.searchAnimeMetadata")(function* (
      query: string,
    ) {
      const trimmed = query.trim();

      if (trimmed.length === 0) {
        return [];
      }

      return yield* trySearchRemote(client, tryExternalEffect, trimmed);
    });

    const getAnimeMetadataById = Effect.fn("AniListClient.getAnimeMetadataById")(function* (
      id: number,
    ) {
      return yield* tryFetchDetail(client, tryExternalEffect, id);
    });

    return {
      getAnimeMetadataById,
      searchAnimeMetadata,
    } satisfies AniListClientShape;
  }),
);

const callAniList = <A, I>(
  client: HttpClient.HttpClient,
  tryExternalEffect: ReturnType<typeof makeTryExternalEffect>,
  operation: string,
  query: string,
  variables: Record<string, unknown>,
  schema: Schema.Schema<A, I, never>,
): Effect.Effect<A, ExternalCallError> =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(ANILIST_URL).pipe(
      HttpClientRequest.bodyJson({ query, variables }),
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: `Failed to encode AniList ${operation} request body`,
          operation: `anilist.${operation}.request`,
        }),
      ),
    );
    const response = yield* tryExternalEffect(`anilist.${operation}`, client.execute(request))();

    if (response.status < 200 || response.status >= 300) {
      return yield* ExternalCallError.make({
        cause: new Error(`AniList ${operation} failed with status ${response.status}`),
        message: `AniList ${operation} failed`,
        operation: `anilist.${operation}.response`,
      });
    }

    return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: `AniList ${operation} response decode failed`,
          operation: `anilist.${operation}.json`,
        }),
      ),
    );
  });

const trySearchRemote = Effect.fn("AniListClient.trySearchRemote")(function* (
  client: HttpClient.HttpClient,
  tryExternalEffect: ReturnType<typeof makeTryExternalEffect>,
  trimmed: string,
) {
  const payload = yield* callAniList(
    client,
    tryExternalEffect,
    "search",
    SEARCH_ANIME_QUERY,
    { search: trimmed },
    AniListSearchPayloadSchema,
  );

  return yield* Effect.forEach(payload.data.Page.media, (entry) =>
    Schema.decodeUnknown(AnimeSearchResultFromAniListSchema)(entry).pipe(
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: "AniList search result normalization failed",
          operation: "anilist.search.normalize",
        }),
      ),
    ),
  );
});

const tryFetchDetail = Effect.fn("AniListClient.tryFetchDetail")(function* (
  client: HttpClient.HttpClient,
  tryExternalEffect: ReturnType<typeof makeTryExternalEffect>,
  id: number,
) {
  const payload = yield* callAniList(
    client,
    tryExternalEffect,
    "detail",
    DETAIL_ANIME_QUERY,
    { id },
    AniListDetailPayloadSchema,
  );
  const media = payload.data.Media;

  if (!media) {
    return Option.none();
  }

  const decoded = yield* Schema.decodeUnknown(AnimeMetadataFromAniListSchema)(media).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "AniList detail normalization failed",
        operation: "anilist.detail.normalize",
      }),
    ),
  );

  return Option.some(decoded);
});
