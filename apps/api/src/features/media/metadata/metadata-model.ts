import { Schema } from "effect";

import { MediaDiscoveryEntrySchema } from "@packages/shared/index.ts";

const AnimeMetadataTitleSchema = Schema.Struct({
  english: Schema.optional(Schema.String),
  native: Schema.optional(Schema.String),
  romaji: Schema.String,
});

const AnimeDateStringSchema = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/),
);
const AnimePositiveIntSchema = Schema.Number.pipe(Schema.int(), Schema.positive());
const AnimeNonNegativeIntSchema = Schema.Number.pipe(Schema.int(), Schema.nonNegative());
const AnimeScoreSchema = Schema.Number.pipe(Schema.between(0, 100));

const AnimeMetadataAiringScheduleItemSchema = Schema.Struct({
  airingAt: AnimeDateStringSchema,
  episode: AnimePositiveIntSchema,
});

export const AnimeMetadataEpisodeSchema = Schema.Struct({
  aired: Schema.optional(AnimeDateStringSchema),
  durationSeconds: Schema.optional(AnimePositiveIntSchema),
  number: AnimePositiveIntSchema,
  title: Schema.optional(Schema.String),
});

export const AnimeMetadataSchema = Schema.Struct({
  background: Schema.optional(Schema.String),
  bannerImage: Schema.optional(Schema.String),
  coverImage: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  duration: Schema.optional(Schema.String),
  endDate: Schema.optional(AnimeDateStringSchema),
  endYear: Schema.optional(AnimeNonNegativeIntSchema),
  mediaUnits: Schema.optional(Schema.Array(AnimeMetadataEpisodeSchema)),
  unitCount: Schema.optional(AnimeNonNegativeIntSchema),
  favorites: Schema.optional(AnimeNonNegativeIntSchema),
  format: Schema.String,
  futureAiringSchedule: Schema.optional(Schema.Array(AnimeMetadataAiringScheduleItemSchema)),
  genres: Schema.optional(Schema.Array(Schema.String)),
  id: AnimePositiveIntSchema,
  malId: Schema.optional(AnimePositiveIntSchema),
  members: Schema.optional(AnimeNonNegativeIntSchema),
  nextAiringUnit: Schema.optional(AnimeMetadataAiringScheduleItemSchema),
  popularity: Schema.optional(AnimePositiveIntSchema),
  rank: Schema.optional(AnimePositiveIntSchema),
  rating: Schema.optional(Schema.String),
  recommendedMedia: Schema.optional(Schema.Array(MediaDiscoveryEntrySchema)),
  relatedMedia: Schema.optional(Schema.Array(MediaDiscoveryEntrySchema)),
  score: Schema.optional(AnimeScoreSchema),
  source: Schema.optional(Schema.String),
  startDate: Schema.optional(AnimeDateStringSchema),
  startYear: Schema.optional(AnimeNonNegativeIntSchema),
  status: Schema.String,
  studios: Schema.optional(Schema.Array(Schema.String)),
  synonyms: Schema.optional(Schema.Array(Schema.String)),
  title: AnimeMetadataTitleSchema,
});

export type AnimeMetadata = Schema.Schema.Type<typeof AnimeMetadataSchema>;
export type AnimeMetadataEpisode = Schema.Schema.Type<typeof AnimeMetadataEpisodeSchema>;

const ProviderMediaSearchResultTitleSchema = Schema.Struct({
  romaji: Schema.optional(Schema.String),
  english: Schema.optional(Schema.String),
  native: Schema.optional(Schema.String),
});

export const ProviderMediaSearchResultSchema = Schema.Struct({
  id: AnimePositiveIntSchema,
  media_kind: Schema.optional(Schema.Literal("anime", "manga", "light_novel")),
  title: ProviderMediaSearchResultTitleSchema,
  format: Schema.optional(Schema.String),
  source: Schema.optional(Schema.String),
  duration: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.String),
  rank: Schema.optional(Schema.Number),
  popularity: Schema.optional(Schema.Number),
  members: Schema.optional(Schema.Number),
  favorites: Schema.optional(Schema.Number),
  unit_count: Schema.optional(Schema.Number),
  volume_count: Schema.optional(Schema.Number),
  chapter_count: Schema.optional(Schema.Number),
  status: Schema.optional(Schema.String),
  start_date: Schema.optional(Schema.String),
  end_date: Schema.optional(Schema.String),
  start_year: Schema.optional(Schema.Number),
  end_year: Schema.optional(Schema.Number),
  season: Schema.optional(Schema.Literal("winter", "spring", "summer", "fall")),
  season_year: Schema.optional(Schema.Number),
  cover_image: Schema.optional(Schema.String),
  banner_image: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  genres: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  synonyms: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  related_media: Schema.optional(Schema.mutable(Schema.Array(MediaDiscoveryEntrySchema))),
  recommended_media: Schema.optional(Schema.mutable(Schema.Array(MediaDiscoveryEntrySchema))),
  already_in_library: Schema.optional(Schema.Boolean),
});

export type ProviderMediaSearchResult = Schema.Schema.Type<typeof ProviderMediaSearchResultSchema>;
