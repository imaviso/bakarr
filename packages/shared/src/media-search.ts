// Shared media search wire contracts.
import { Schema } from "effect";
import { MediaIdSchema, type MediaId, MediaKindSchema, type MediaKind } from "./ids.ts";
import {
  MediaSeasonSchema,
  type MediaSeason,
  MediaDiscoveryEntrySchema,
  type MediaDiscoveryEntry,
} from "./media.ts";

export interface MediaSearchResult {
  id: MediaId;
  media_kind?: MediaKind | undefined | null;
  title: {
    romaji?: string | undefined | null;
    english?: string | undefined | null;
    native?: string | undefined | null;
  };
  format?: string | undefined | null;
  source?: string | undefined | null;
  duration?: string | undefined | null;
  rating?: string | undefined | null;
  rank?: number | undefined | null;
  popularity?: number | undefined | null;
  members?: number | undefined | null;
  favorites?: number | undefined | null;
  unit_count?: number | undefined | null;
  volume_count?: number | undefined | null;
  chapter_count?: number | undefined | null;
  status?: string | undefined | null;
  start_date?: string | undefined | null;
  end_date?: string | undefined | null;
  start_year?: number | undefined | null;
  end_year?: number | undefined | null;
  season?: MediaSeason | undefined | null;
  season_year?: number | undefined | null;
  cover_image?: string | undefined | null;
  banner_image?: string | undefined | null;
  description?: string | undefined | null;
  genres?: string[] | undefined | null;
  synonyms?: string[] | undefined | null;
  related_media?: MediaDiscoveryEntry[] | undefined | null;
  recommended_media?: MediaDiscoveryEntry[] | undefined | null;
  match_confidence?: number | undefined | null;
  match_reason?: string | undefined | null;
  already_in_library?: boolean | undefined | null;
}

export const MediaSearchResultTitleSchema = Schema.Struct({
  romaji: Schema.optional(Schema.NullishOr(Schema.String)),
  english: Schema.optional(Schema.NullishOr(Schema.String)),
  native: Schema.optional(Schema.NullishOr(Schema.String)),
});

export const MediaSearchResultSchema = Schema.Struct({
  id: MediaIdSchema,
  media_kind: Schema.optional(Schema.NullishOr(MediaKindSchema)),
  title: MediaSearchResultTitleSchema,
  format: Schema.optional(Schema.NullishOr(Schema.String)),
  source: Schema.optional(Schema.NullishOr(Schema.String)),
  duration: Schema.optional(Schema.NullishOr(Schema.String)),
  rating: Schema.optional(Schema.NullishOr(Schema.String)),
  rank: Schema.optional(Schema.NullishOr(Schema.Number)),
  popularity: Schema.optional(Schema.NullishOr(Schema.Number)),
  members: Schema.optional(Schema.NullishOr(Schema.Number)),
  favorites: Schema.optional(Schema.NullishOr(Schema.Number)),
  unit_count: Schema.optional(Schema.NullishOr(Schema.Number)),
  volume_count: Schema.optional(Schema.NullishOr(Schema.Number)),
  chapter_count: Schema.optional(Schema.NullishOr(Schema.Number)),
  status: Schema.optional(Schema.NullishOr(Schema.String)),
  start_date: Schema.optional(Schema.NullishOr(Schema.String)),
  end_date: Schema.optional(Schema.NullishOr(Schema.String)),
  start_year: Schema.optional(Schema.NullishOr(Schema.Number)),
  end_year: Schema.optional(Schema.NullishOr(Schema.Number)),
  season: Schema.optional(Schema.NullishOr(MediaSeasonSchema)),
  season_year: Schema.optional(Schema.NullishOr(Schema.Number)),
  cover_image: Schema.optional(Schema.NullishOr(Schema.String)),
  banner_image: Schema.optional(Schema.NullishOr(Schema.String)),
  description: Schema.optional(Schema.NullishOr(Schema.String)),
  genres: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.String)))),
  synonyms: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.String)))),
  related_media: Schema.optional(
    Schema.NullishOr(Schema.mutable(Schema.Array(MediaDiscoveryEntrySchema))),
  ),
  recommended_media: Schema.optional(
    Schema.NullishOr(Schema.mutable(Schema.Array(MediaDiscoveryEntrySchema))),
  ),
  match_confidence: Schema.optional(Schema.NullishOr(Schema.Number)),
  match_reason: Schema.optional(Schema.NullishOr(Schema.String)),
  already_in_library: Schema.optional(Schema.NullishOr(Schema.Boolean)),
});

export interface MediaSearchResponse {
  results: MediaSearchResult[];
  degraded: boolean;
}

export const MediaSearchResponseSchema = Schema.Struct({
  degraded: Schema.Boolean,
  results: Schema.mutable(Schema.Array(MediaSearchResultSchema)),
});
