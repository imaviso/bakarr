import { Schema } from "effect";

import { AnimeDiscoveryEntrySchema, AnimeSearchResultSchema } from "@packages/shared/index.ts";
import type { AnimeDiscoveryEntry } from "@packages/shared/index.ts";
import { deriveAnimeSeason } from "@/lib/anime-date-utils.ts";

const AnimeMetadataTitleSchema = Schema.Struct({
  english: Schema.optional(Schema.String),
  native: Schema.optional(Schema.String),
  romaji: Schema.String,
});

const AnimeMetadataAiringScheduleItemSchema = Schema.Struct({
  airingAt: Schema.String,
  episode: Schema.Number,
});

const AnimeMetadataEpisodeSchema = Schema.Struct({
  aired: Schema.optional(Schema.String),
  number: Schema.Number,
  title: Schema.optional(Schema.String),
});

export const AnimeMetadataSchema = Schema.Struct({
  bannerImage: Schema.optional(Schema.String),
  coverImage: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  endDate: Schema.optional(Schema.String),
  endYear: Schema.optional(Schema.Number),
  episodes: Schema.optional(Schema.Array(AnimeMetadataEpisodeSchema)),
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
export type AnimeMetadataEpisode = Schema.Schema.Type<typeof AnimeMetadataEpisodeSchema>;

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

const AniListCoverImageSchema = Schema.Struct({
  extraLarge: Schema.optional(Schema.NullOr(Schema.String)),
  large: Schema.optional(Schema.NullOr(Schema.String)),
});

const AniListRelationNodeSchema = Schema.Struct({
  averageScore: Schema.optional(Schema.NullOr(Schema.Number)),
  coverImage: Schema.optional(AniListCoverImageSchema),
  format: Schema.optional(Schema.NullOr(Schema.String)),
  id: Schema.Number,
  startDate: Schema.optional(AniListDateSchema),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.optional(AniListTitleSchema),
});

const AniListRelationEdgeSchema = Schema.Struct({
  node: Schema.optional(Schema.NullOr(AniListRelationNodeSchema)),
  relationType: Schema.optional(Schema.NullOr(Schema.String)),
});

const AniListRelationConnectionSchema = Schema.Struct({
  edges: Schema.Array(AniListRelationEdgeSchema),
});

const AniListRecommendationNodeSchema = Schema.Struct({
  mediaRecommendation: Schema.optional(Schema.NullOr(AniListRelationNodeSchema)),
});

const AniListRecommendationConnectionSchema = Schema.Struct({
  nodes: Schema.Array(AniListRecommendationNodeSchema),
});

const AniListStudioNodeSchema = Schema.Struct({
  name: Schema.optional(Schema.NullOr(Schema.String)),
});

const AniListStudioConnectionSchema = Schema.Struct({
  nodes: Schema.Array(AniListStudioNodeSchema),
});

const AniListSearchMediaSchema = Schema.Struct({
  bannerImage: Schema.optional(Schema.NullOr(Schema.String)),
  coverImage: Schema.optional(AniListCoverImageSchema),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  endDate: Schema.optional(AniListDateSchema),
  episodes: Schema.optional(Schema.NullOr(Schema.Number)),
  format: Schema.optional(Schema.NullOr(Schema.String)),
  genres: Schema.optional(Schema.Array(Schema.String)),
  id: Schema.Number,
  relations: Schema.optional(AniListRelationConnectionSchema),
  recommendations: Schema.optional(AniListRecommendationConnectionSchema),
  startDate: Schema.optional(AniListDateSchema),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  synonyms: Schema.optional(Schema.Array(Schema.String)),
  title: Schema.optional(AniListTitleSchema),
});

const AniListAiringScheduleSchema = Schema.Struct({
  airingAt: Schema.Number,
  episode: Schema.Number,
});

const AniListAiringConnectionSchema = Schema.Struct({
  nodes: Schema.Array(AniListAiringScheduleSchema),
});

const AniListSearchPageSchema = Schema.Struct({
  media: Schema.Array(AniListSearchMediaSchema),
});

const AniListSearchDataSchema = Schema.Struct({
  Page: AniListSearchPageSchema,
});

export const AniListSearchPayloadSchema = Schema.Struct({
  data: AniListSearchDataSchema,
});

type AniListDateInput = {
  readonly day?: number | null | undefined;
  readonly month?: number | null | undefined;
  readonly year?: number | null | undefined;
};

type AniListDiscoveryNodeInput = {
  readonly averageScore?: number | null | undefined;
  readonly coverImage?:
    | {
        readonly extraLarge?: string | null | undefined;
        readonly large?: string | null | undefined;
      }
    | undefined;
  readonly format?: string | null | undefined;
  readonly id: number;
  readonly startDate?: AniListDateInput | undefined;
  readonly status?: string | null | undefined;
  readonly title?:
    | {
        readonly english?: string | null | undefined;
        readonly native?: string | null | undefined;
        readonly romaji?: string | null | undefined;
      }
    | undefined;
};

const AniListDetailMediaSchema = Schema.Struct({
  airingSchedule: Schema.optional(Schema.NullOr(AniListAiringConnectionSchema)),
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
  nextAiringEpisode: Schema.optional(Schema.NullOr(AniListAiringScheduleSchema)),
  recommendations: Schema.optional(AniListRecommendationConnectionSchema),
  relations: Schema.optional(AniListRelationConnectionSchema),
  startDate: Schema.optional(AniListDateSchema),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  studios: Schema.optional(AniListStudioConnectionSchema),
  synonyms: Schema.optional(Schema.Array(Schema.String)),
  title: Schema.optional(AniListTitleSchema),
});

const AniListDetailDataSchema = Schema.Struct({
  Media: Schema.optional(Schema.NullOr(AniListDetailMediaSchema)),
});

export const AniListDetailPayloadSchema = Schema.Struct({
  data: AniListDetailDataSchema,
});

export const AnimeSearchResultFromAniListSchema = Schema.transform(
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
      season: deriveAnimeSeason(toIsoDate(entry.startDate)),
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

export const AnimeMetadataFromAniListSchema = Schema.transform(
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

function toIsoDate(date?: AniListDateInput): string | undefined {
  if (!date?.year || !date?.month) {
    return undefined;
  }

  const day = date.day ?? 1;

  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}`;
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
    .toSorted((left, right) => left.episode - right.episode)
    .map((entry) => ({
      airingAt: new Date(entry.airingAt * 1000).toISOString(),
      episode: entry.episode,
    }));
}

function normalizeDiscoveryEntries(
  edges:
    | ReadonlyArray<{
        readonly relationType?: string | null | undefined;
        readonly node?: AniListDiscoveryNodeInput | null | undefined;
      }>
    | undefined,
) {
  if (!Array.isArray(edges) || edges.length === 0) {
    return [];
  }

  const seen = new Set<number>();

  return edges.flatMap((edge) => {
    const { node } = edge;

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
        readonly mediaRecommendation?: AniListDiscoveryNodeInput | null | undefined;
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
  node: AniListDiscoveryNodeInput,
  relationType?: string,
): AnimeDiscoveryEntry {
  return {
    cover_image: node.coverImage?.extraLarge ?? node.coverImage?.large ?? undefined,
    format: node.format ?? undefined,
    id: node.id,
    rating: node.averageScore ?? undefined,
    relation_type: relationType,
    season: deriveAnimeSeason(toIsoDate(node.startDate)),
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
