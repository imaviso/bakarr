import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer, Schema } from "effect";

import {
  AnimeDiscoveryEntrySchema,
  AnimeSearchResultSchema,
} from "../../../../../packages/shared/src/index.ts";
import type {
  AnimeDiscoveryEntry,
  AnimeSearchResult,
} from "../../../../../packages/shared/src/index.ts";
import { ClockService } from "../../lib/clock.ts";
import { ExternalCallError, makeTryExternalEffect } from "../../lib/effect-retry.ts";

const AnimeMetadataTitleSchema = Schema.Struct({
  english: Schema.optional(Schema.String),
  native: Schema.optional(Schema.String),
  romaji: Schema.String,
});

const AnimeMetadataAiringScheduleItemSchema = Schema.Struct({
  airingAt: Schema.String,
  episode: Schema.Number,
});

export const AnimeMetadataSchema = Schema.Struct({
  bannerImage: Schema.optional(Schema.String),
  coverImage: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  endDate: Schema.optional(Schema.String),
  endYear: Schema.optional(Schema.Number),
  episodeCount: Schema.optional(Schema.Number),
  format: Schema.String,
  futureAiringSchedule: Schema.optional(Schema.Array(AnimeMetadataAiringScheduleItemSchema)),
  genres: Schema.optional(Schema.Array(Schema.String)),
  id: Schema.Number,
  malId: Schema.optional(Schema.Number),
  nextAiringEpisode: Schema.optional(AnimeMetadataAiringScheduleItemSchema),
  recommendedAnime: Schema.optional(Schema.Array(AnimeDiscoveryEntrySchema)),
  relatedAnime: Schema.optional(Schema.Array(AnimeDiscoveryEntrySchema)),
  score: Schema.optional(Schema.Number),
  startDate: Schema.optional(Schema.String),
  startYear: Schema.optional(Schema.Number),
  status: Schema.String,
  studios: Schema.optional(Schema.Array(Schema.String)),
  synonyms: Schema.optional(Schema.Array(Schema.String)),
  title: AnimeMetadataTitleSchema,
});

export type AnimeMetadata = Schema.Schema.Type<typeof AnimeMetadataSchema>;

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

class AniListTitleSchema extends Schema.Class<AniListTitleSchema>("AniListTitleSchema")({
  english: Schema.optional(Schema.NullOr(Schema.String)),
  native: Schema.optional(Schema.NullOr(Schema.String)),
  romaji: Schema.optional(Schema.NullOr(Schema.String)),
}) {}

class AniListDateSchema extends Schema.Class<AniListDateSchema>("AniListDateSchema")({
  day: Schema.optional(Schema.NullOr(Schema.Number)),
  month: Schema.optional(Schema.NullOr(Schema.Number)),
  year: Schema.optional(Schema.NullOr(Schema.Number)),
}) {}

class AniListCoverImageSchema extends Schema.Class<AniListCoverImageSchema>(
  "AniListCoverImageSchema",
)({
  extraLarge: Schema.optional(Schema.NullOr(Schema.String)),
  large: Schema.optional(Schema.NullOr(Schema.String)),
}) {}

class AniListRelationNodeSchema extends Schema.Class<AniListRelationNodeSchema>(
  "AniListRelationNodeSchema",
)({
  coverImage: Schema.optional(AniListCoverImageSchema),
  format: Schema.optional(Schema.NullOr(Schema.String)),
  id: Schema.Number,
  averageScore: Schema.optional(Schema.NullOr(Schema.Number)),
  startDate: Schema.optional(AniListDateSchema),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.optional(AniListTitleSchema),
}) {}

class AniListRelationEdgeSchema extends Schema.Class<AniListRelationEdgeSchema>(
  "AniListRelationEdgeSchema",
)({
  relationType: Schema.optional(Schema.NullOr(Schema.String)),
  node: Schema.optional(Schema.NullOr(AniListRelationNodeSchema)),
}) {}

class AniListRelationConnectionSchema extends Schema.Class<AniListRelationConnectionSchema>(
  "AniListRelationConnectionSchema",
)({
  edges: Schema.Array(AniListRelationEdgeSchema),
}) {}

class AniListRecommendationNodeSchema extends Schema.Class<AniListRecommendationNodeSchema>(
  "AniListRecommendationNodeSchema",
)({
  mediaRecommendation: Schema.optional(Schema.NullOr(AniListRelationNodeSchema)),
}) {}

class AniListRecommendationConnectionSchema extends Schema.Class<AniListRecommendationConnectionSchema>(
  "AniListRecommendationConnectionSchema",
)({
  nodes: Schema.Array(AniListRecommendationNodeSchema),
}) {}

class AniListStudioNodeSchema extends Schema.Class<AniListStudioNodeSchema>(
  "AniListStudioNodeSchema",
)({
  name: Schema.optional(Schema.NullOr(Schema.String)),
}) {}

class AniListStudioConnectionSchema extends Schema.Class<AniListStudioConnectionSchema>(
  "AniListStudioConnectionSchema",
)({
  nodes: Schema.Array(AniListStudioNodeSchema),
}) {}

class AniListSearchMediaSchema extends Schema.Class<AniListSearchMediaSchema>(
  "AniListSearchMediaSchema",
)({
  coverImage: Schema.optional(AniListCoverImageSchema),
  episodes: Schema.optional(Schema.NullOr(Schema.Number)),
  format: Schema.optional(Schema.NullOr(Schema.String)),
  id: Schema.Number,
  endDate: Schema.optional(AniListDateSchema),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  startDate: Schema.optional(AniListDateSchema),
  genres: Schema.optional(Schema.Array(Schema.String)),
  synonyms: Schema.optional(Schema.Array(Schema.String)),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.optional(AniListTitleSchema),
  bannerImage: Schema.optional(Schema.NullOr(Schema.String)),
  relations: Schema.optional(AniListRelationConnectionSchema),
  recommendations: Schema.optional(AniListRecommendationConnectionSchema),
}) {}

class AniListAiringScheduleSchema extends Schema.Class<AniListAiringScheduleSchema>(
  "AniListAiringScheduleSchema",
)({
  airingAt: Schema.Number,
  episode: Schema.Number,
}) {}

class AniListAiringConnectionSchema extends Schema.Class<AniListAiringConnectionSchema>(
  "AniListAiringConnectionSchema",
)({
  nodes: Schema.Array(AniListAiringScheduleSchema),
}) {}

class AniListSearchPageSchema extends Schema.Class<AniListSearchPageSchema>(
  "AniListSearchPageSchema",
)({
  media: Schema.Array(AniListSearchMediaSchema),
}) {}

class AniListSearchDataSchema extends Schema.Class<AniListSearchDataSchema>(
  "AniListSearchDataSchema",
)({
  Page: AniListSearchPageSchema,
}) {}

class AniListSearchPayloadSchema extends Schema.Class<AniListSearchPayloadSchema>(
  "AniListSearchPayloadSchema",
)({
  data: AniListSearchDataSchema,
}) {}

class AniListDetailMediaSchema extends Schema.Class<AniListDetailMediaSchema>(
  "AniListDetailMediaSchema",
)({
  averageScore: Schema.optional(Schema.NullOr(Schema.Number)),
  bannerImage: Schema.optional(Schema.NullOr(Schema.String)),
  coverImage: Schema.optional(AniListCoverImageSchema),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  endDate: Schema.optional(AniListDateSchema),
  episodes: Schema.optional(Schema.NullOr(Schema.Number)),
  format: Schema.optional(Schema.NullOr(Schema.String)),
  genres: Schema.optional(Schema.Array(Schema.String)),
  id: Schema.Number,
  idMal: Schema.optional(Schema.NullOr(Schema.Number)),
  synonyms: Schema.optional(Schema.Array(Schema.String)),
  nextAiringEpisode: Schema.optional(Schema.NullOr(AniListAiringScheduleSchema)),
  airingSchedule: Schema.optional(Schema.NullOr(AniListAiringConnectionSchema)),
  startDate: Schema.optional(AniListDateSchema),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  studios: Schema.optional(AniListStudioConnectionSchema),
  title: Schema.optional(AniListTitleSchema),
  relations: Schema.optional(AniListRelationConnectionSchema),
  recommendations: Schema.optional(AniListRecommendationConnectionSchema),
}) {}

class AniListDetailDataSchema extends Schema.Class<AniListDetailDataSchema>(
  "AniListDetailDataSchema",
)({
  Media: Schema.optional(Schema.NullOr(AniListDetailMediaSchema)),
}) {}

class AniListDetailPayloadSchema extends Schema.Class<AniListDetailPayloadSchema>(
  "AniListDetailPayloadSchema",
)({
  data: AniListDetailDataSchema,
}) {}

const AnimeSearchResultFromAniListSchema = Schema.transform(
  AniListSearchMediaSchema,
  AnimeSearchResultSchema,
  {
    decode: (entry) => ({
      already_in_library: false,
      banner_image: entry.bannerImage ?? undefined,
      cover_image: entry.coverImage?.extraLarge ?? entry.coverImage?.large ?? undefined,
      description: entry.description ?? undefined,
      end_date: toIsoDate(entry.endDate),
      end_year: entry.endDate?.year ?? undefined,
      episode_count: entry.episodes ?? undefined,
      format: entry.format ?? undefined,
      genres: entry.genres ? [...entry.genres] : undefined,
      id: entry.id,
      recommended_anime: normalizeRecommendations(entry.recommendations?.nodes),
      related_anime: normalizeDiscoveryEntries(entry.relations?.edges),
      season: deriveAnimeSeason(entry.startDate),
      season_year: entry.startDate?.year ?? undefined,
      start_date: toIsoDate(entry.startDate),
      start_year: entry.startDate?.year ?? undefined,
      status: entry.status ?? undefined,
      synonyms: normalizeSynonyms(entry.synonyms),
      title: {
        english: entry.title?.english ?? undefined,
        native: entry.title?.native ?? undefined,
        romaji: entry.title?.romaji ?? undefined,
      },
    }),
    encode: (entry) => ({
      bannerImage: entry.banner_image,
      coverImage: entry.cover_image
        ? { extraLarge: entry.cover_image, large: entry.cover_image }
        : undefined,
      description: entry.description,
      endDate: undefined,
      episodes: entry.episode_count,
      format: entry.format,
      genres: entry.genres,
      id: entry.id,
      recommendations: undefined,
      relations: undefined,
      startDate: undefined,
      status: entry.status,
      synonyms: entry.synonyms,
      title: {
        english: entry.title.english,
        native: entry.title.native,
        romaji: entry.title.romaji,
      },
    }),
  },
);

const AnimeMetadataFromAniListSchema = Schema.transform(
  AniListDetailMediaSchema,
  AnimeMetadataSchema,
  {
    decode: (media) => ({
      bannerImage: media.bannerImage ?? undefined,
      coverImage: media.coverImage?.extraLarge ?? media.coverImage?.large ?? undefined,
      description: media.description ?? undefined,
      endDate: toIsoDate(media.endDate),
      endYear: media.endDate?.year ?? undefined,
      episodeCount: media.episodes ?? undefined,
      format: media.format ?? "TV",
      futureAiringSchedule: normalizeFutureAiringSchedule(media.airingSchedule?.nodes),
      genres: [...(media.genres ?? [])],
      id: media.id,
      malId: media.idMal ?? undefined,
      nextAiringEpisode: toNextAiringEpisode(media.nextAiringEpisode),
      recommendedAnime: normalizeRecommendations(media.recommendations?.nodes),
      relatedAnime: normalizeDiscoveryEntries(media.relations?.edges),
      score: media.averageScore ?? undefined,
      startDate: toIsoDate(media.startDate),
      startYear: media.startDate?.year ?? undefined,
      status: media.status ?? "UNKNOWN",
      studios: Array.isArray(media.studios?.nodes)
        ? media.studios.nodes
            .map((entry) => entry.name)
            .filter((name): name is string => typeof name === "string" && name.length > 0)
        : [],
      synonyms: normalizeSynonyms(media.synonyms),
      title: {
        english: media.title?.english ?? undefined,
        native: media.title?.native ?? undefined,
        romaji: media.title?.romaji ?? `Anime ${media.id}`,
      },
    }),
    encode: (metadata) => ({
      airingSchedule: undefined,
      averageScore: metadata.score,
      bannerImage: metadata.bannerImage,
      coverImage: metadata.coverImage
        ? { extraLarge: metadata.coverImage, large: metadata.coverImage }
        : undefined,
      description: metadata.description,
      endDate: undefined,
      episodes: metadata.episodeCount,
      format: metadata.format,
      genres: metadata.genres,
      id: metadata.id,
      idMal: metadata.malId,
      nextAiringEpisode: undefined,
      recommendations: undefined,
      relations: undefined,
      startDate: undefined,
      status: metadata.status,
      studios: undefined,
      synonyms: metadata.synonyms,
      title: {
        english: metadata.title.english,
        native: metadata.title.native,
        romaji: metadata.title.romaji,
      },
    }),
  },
);

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

const trySearchRemote = Effect.fn("AniListClient.trySearchRemote")(function* (
  client: HttpClient.HttpClient,
  tryExternalEffect: ReturnType<typeof makeTryExternalEffect>,
  trimmed: string,
) {
  const request = yield* HttpClientRequest.post(ANILIST_URL).pipe(
    HttpClientRequest.bodyJson({
      query: SEARCH_ANIME_QUERY,
      variables: { search: trimmed },
    }),
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Failed to encode AniList search request body",
        operation: "anilist.search.request",
      }),
    ),
  );
  const response = yield* tryExternalEffect("anilist.search", client.execute(request))();

  if (response.status < 200 || response.status >= 300) {
    return yield* ExternalCallError.make({
      cause: new Error(`AniList search failed with status ${response.status}`),
      message: "AniList search failed",
      operation: "anilist.search.response",
    });
  }

  const payload = yield* HttpClientResponse.schemaBodyJson(AniListSearchPayloadSchema)(
    response,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "AniList search response decode failed",
        operation: "anilist.search.json",
      }),
    ),
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
  const request = yield* HttpClientRequest.post(ANILIST_URL).pipe(
    HttpClientRequest.bodyJson({
      query: DETAIL_ANIME_QUERY,
      variables: { id },
    }),
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Failed to encode AniList detail request body",
        operation: "anilist.detail.request",
      }),
    ),
  );
  const response = yield* tryExternalEffect("anilist.detail", client.execute(request))();

  if (response.status < 200 || response.status >= 300) {
    return yield* ExternalCallError.make({
      cause: new Error(`AniList detail failed with status ${response.status}`),
      message: "AniList detail failed",
      operation: "anilist.detail.response",
    });
  }

  const payload = yield* HttpClientResponse.schemaBodyJson(AniListDetailPayloadSchema)(
    response,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "AniList detail response decode failed",
        operation: "anilist.detail.json",
      }),
    ),
  );
  const media = payload.data.Media;

  if (!media) {
    return null;
  }

  return yield* Schema.decodeUnknown(AnimeMetadataFromAniListSchema)(media).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "AniList detail normalization failed",
        operation: "anilist.detail.normalize",
      }),
    ),
  );
});

function deriveAnimeSeason(
  date: { year?: number | null; month?: number | null; day?: number | null } | undefined,
) {
  const month = date?.month ?? undefined;

  if (!month) {
    return undefined;
  }

  if (month <= 2 || month === 12) return "winter" as const;
  if (month <= 5) return "spring" as const;
  if (month <= 8) return "summer" as const;
  return "fall" as const;
}

function toIsoDate(
  date: { year?: number | null; month?: number | null; day?: number | null } | undefined,
): string | undefined {
  if (!date?.year || !date?.month || !date?.day) {
    return undefined;
  }

  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(
    2,
    "0",
  )}-${String(date.day).padStart(2, "0")}`;
}

function toNextAiringEpisode(airing: { airingAt: number; episode: number } | null | undefined) {
  if (!airing) {
    return undefined;
  }

  return {
    airingAt: new Date(airing.airingAt * 1000).toISOString(),
    episode: airing.episode,
  };
}

function normalizeFutureAiringSchedule(
  schedule: ReadonlyArray<{ airingAt: number; episode: number }> | undefined,
) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return [];
  }

  return [...schedule]
    .filter((entry) => Number.isFinite(entry.episode) && entry.episode > 0)
    .sort((left, right) => left.episode - right.episode)
    .map((entry) => ({
      airingAt: new Date(entry.airingAt * 1000).toISOString(),
      episode: entry.episode,
    }));
}

function normalizeDiscoveryEntries(
  edges:
    | ReadonlyArray<{
        relationType?: string | null;
        node?: {
          averageScore?: number | null;
          coverImage?: {
            extraLarge?: string | null;
            large?: string | null;
          };
          format?: string | null;
          id: number;
          startDate?: {
            year?: number | null;
            month?: number | null;
            day?: number | null;
          };
          status?: string | null;
          title?: {
            english?: string | null;
            native?: string | null;
            romaji?: string | null;
          };
        } | null;
      }>
    | undefined,
) {
  if (!Array.isArray(edges) || edges.length === 0) {
    return [];
  }

  const seen = new Set<number>();

  return edges.flatMap((edge) => {
    const node = edge.node;

    if (!node || seen.has(node.id)) {
      return [];
    }

    seen.add(node.id);

    return [toDiscoveryEntry(node, edge.relationType ?? undefined)];
  });
}

function normalizeRecommendations(
  nodes:
    | ReadonlyArray<{
        mediaRecommendation?: {
          averageScore?: number | null;
          coverImage?: {
            extraLarge?: string | null;
            large?: string | null;
          };
          format?: string | null;
          id: number;
          startDate?: {
            year?: number | null;
            month?: number | null;
            day?: number | null;
          };
          status?: string | null;
          title?: {
            english?: string | null;
            native?: string | null;
            romaji?: string | null;
          };
        } | null;
      }>
    | undefined,
) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const seen = new Set<number>();

  return nodes.flatMap((entry) => {
    const media = entry.mediaRecommendation;

    if (!media || seen.has(media.id)) {
      return [];
    }

    seen.add(media.id);

    return [toDiscoveryEntry(media)];
  });
}

function toDiscoveryEntry(
  node: {
    averageScore?: number | null;
    coverImage?: { extraLarge?: string | null; large?: string | null };
    format?: string | null;
    id: number;
    startDate?: {
      year?: number | null;
      month?: number | null;
      day?: number | null;
    };
    status?: string | null;
    title?: {
      english?: string | null;
      native?: string | null;
      romaji?: string | null;
    };
  },
  relationType?: string,
): AnimeDiscoveryEntry {
  return {
    cover_image: node.coverImage?.extraLarge ?? node.coverImage?.large ?? undefined,
    format: node.format ?? undefined,
    id: node.id,
    rating: node.averageScore ?? undefined,
    relation_type: relationType,
    season: deriveAnimeSeason(node.startDate),
    season_year: node.startDate?.year ?? undefined,
    start_year: node.startDate?.year ?? undefined,
    status: node.status ?? undefined,
    title: {
      english: node.title?.english ?? undefined,
      native: node.title?.native ?? undefined,
      romaji: node.title?.romaji ?? undefined,
    },
  };
}

function normalizeSynonyms(synonyms: ReadonlyArray<string> | undefined) {
  if (!Array.isArray(synonyms) || synonyms.length === 0) {
    return undefined;
  }

  const unique = [
    ...new Set(synonyms.map((value) => value.trim()).filter((value) => value.length > 0)),
  ];

  return unique.length > 0 ? unique : undefined;
}
