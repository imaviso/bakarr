import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer, Option, Schema } from "effect";

import type { AnimeSearchResult, AnimeSeason } from "@packages/shared/index.ts";
import { ExternalCall, ExternalCallError, type ExternalCallShape } from "@/infra/effect/retry.ts";
import {
  AnimeMetadataFromAniListSchema,
  AnimeSearchResultFromAniListSchema,
  AniListDetailPayloadSchema,
  AniListSearchPayloadSchema,
  AniListSeasonalPayloadSchema,
  type AnimeMetadata,
} from "@/features/anime/anilist-model.ts";

const ANILIST_URL = "https://graphql.anilist.co";

const ANILIST_SEASON_MAP: Record<AnimeSeason, "WINTER" | "SPRING" | "SUMMER" | "FALL"> = {
  winter: "WINTER",
  spring: "SPRING",
  summer: "SUMMER",
  fall: "FALL",
};

const SEARCH_ANIME_QUERY = `query ($search: String) {
  Page(page: 1, perPage: 10) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      format
      status
      episodes
      duration
      favourites
      popularity
      rankings {
        rank
        type
        allTime
      }
      source
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
    duration
    favourites
    popularity
    rankings {
      rank
      type
      allTime
    }
    source
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

const SEASONAL_ANIME_QUERY = `query ($season: MediaSeason, $seasonYear: Int, $perPage: Int, $page: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
    }
    media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC) {
      id
      format
      status
      episodes
      duration
      favourites
      popularity
      rankings {
        rank
        type
        allTime
      }
      source
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

interface AniListClientShape {
  readonly searchAnimeMetadata: (
    query: string,
  ) => Effect.Effect<AnimeSearchResult[], ExternalCallError>;
  readonly getAnimeMetadataById: (
    id: number,
  ) => Effect.Effect<Option.Option<AnimeMetadata>, ExternalCallError>;
  readonly getSeasonalAnime: (input: {
    season: AnimeSeason;
    year: number;
    limit: number;
    page?: number;
  }) => Effect.Effect<AnimeSearchResult[], ExternalCallError>;
}

export class AniListClient extends Context.Tag("@bakarr/api/AniListClient")<
  AniListClient,
  AniListClientShape
>() {}

export const AniListClientLive = Layer.effect(
  AniListClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const externalCall = yield* ExternalCall;

    const searchAnimeMetadata = Effect.fn("AniListClient.searchAnimeMetadata")(function* (
      query: string,
    ) {
      const trimmed = query.trim();

      if (trimmed.length === 0) {
        return [];
      }

      return yield* trySearchRemote(client, externalCall, trimmed);
    });

    const getAnimeMetadataById = Effect.fn("AniListClient.getAnimeMetadataById")(function* (
      id: number,
    ) {
      return yield* tryFetchDetail(client, externalCall, id);
    });

    const getSeasonalAnime = Effect.fn("AniListClient.getSeasonalAnime")(function* (input: {
      season: AnimeSeason;
      year: number;
      limit: number;
      page?: number;
    }) {
      return yield* tryFetchSeasonal(client, externalCall, input);
    });

    return {
      getAnimeMetadataById,
      getSeasonalAnime,
      searchAnimeMetadata,
    } satisfies AniListClientShape;
  }),
);

const callAniList = <A, I>(
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  operation: string,
  query: string,
  variables: Record<string, unknown>,
  schema: Schema.Schema<A, I>,
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
    const response = yield* externalCall.tryExternalEffect(
      `anilist.${operation}`,
      client.execute(request),
    );

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
  externalCall: ExternalCallShape,
  trimmed: string,
) {
  const payload = yield* callAniList(
    client,
    externalCall,
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
  externalCall: ExternalCallShape,
  id: number,
) {
  const payload = yield* callAniList(
    client,
    externalCall,
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

const tryFetchSeasonal = Effect.fn("AniListClient.tryFetchSeasonal")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
  input: { season: AnimeSeason; year: number; limit: number; page?: number },
) {
  const seasonEnum = ANILIST_SEASON_MAP[input.season];

  const payload = yield* callAniList(
    client,
    externalCall,
    "seasonal",
    SEASONAL_ANIME_QUERY,
    {
      page: input.page ?? 1,
      perPage: input.limit,
      season: seasonEnum,
      seasonYear: input.year,
    },
    AniListSeasonalPayloadSchema,
  );

  return yield* Effect.forEach(payload.data.Page.media, (entry) =>
    Schema.decodeUnknown(AnimeSearchResultFromAniListSchema)(entry).pipe(
      Effect.map((decoded) => ({
        ...decoded,
        season: decoded.season ?? input.season,
        season_year: decoded.season_year ?? input.year,
      })),
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: "AniList seasonal result normalization failed",
          operation: "anilist.seasonal.normalize",
        }),
      ),
    ),
  );
});
