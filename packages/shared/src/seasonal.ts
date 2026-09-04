// Shared seasonal media wire contracts.
import { Schema, Struct } from "effect";
import { MediaSeasonSchema, type MediaSeason } from "./media.ts";
import { MediaSearchResultSchema, type MediaSearchResult } from "./media-search.ts";

export interface SeasonalMediaQueryParams {
  season?: MediaSeason | undefined;
  year?: number | undefined;
  limit?: number | undefined;
  page?: number | undefined;
}

export const SeasonalMediaQueryParamsSchema = Schema.Struct({
  season: Schema.optional(MediaSeasonSchema),
  year: Schema.optional(
    Schema.Number.pipe(
      Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1970, maximum: 2100 })),
    ),
  ),
  limit: Schema.optional(
    Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 50 }))),
  ),
  page: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0)))),
});

export const SEASONAL_ANIME_PROVIDER_VALUES = ["anilist", "jikan_fallback"] as const;

export type SeasonalMediaProvider = (typeof SEASONAL_ANIME_PROVIDER_VALUES)[number];

export const SeasonalMediaProviderSchema = Schema.Literals([...SEASONAL_ANIME_PROVIDER_VALUES]);

export interface SeasonalMediaResponse {
  season: MediaSeason;
  year: number;
  page: number;
  limit: number;
  has_more: boolean;
  provider: SeasonalMediaProvider;
  degraded: boolean;
  results: MediaSearchResult[];
}

export interface MediaSeasonWindow {
  season: MediaSeason;
  year: number;
}

export function resolveSeasonFromDate(now: Date): MediaSeason {
  const month = now.getMonth() + 1;

  if (month <= 2 || month === 12) {
    return "winter";
  }

  if (month <= 5) {
    return "spring";
  }

  if (month <= 8) {
    return "summer";
  }

  return "fall";
}

export function resolveSeasonYearFromDate(now: Date): number {
  return now.getMonth() + 1 === 12 ? now.getFullYear() + 1 : now.getFullYear();
}

export function resolveSeasonWindowFromDate(now: Date = new Date()): MediaSeasonWindow {
  return {
    season: resolveSeasonFromDate(now),
    year: resolveSeasonYearFromDate(now),
  };
}

export const SeasonalMediaResponseSchema = Schema.Struct({
  season: MediaSeasonSchema,
  year: Schema.Number,
  page: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0))),
  limit: Schema.Number.pipe(
    Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 50 })),
  ),
  has_more: Schema.Boolean,
  provider: SeasonalMediaProviderSchema,
  degraded: Schema.Boolean,
  results: Schema.mutable(Schema.Array(MediaSearchResultSchema)),
}).mapFields(Struct.map(Schema.mutableKey));
