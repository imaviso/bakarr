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
  media_kind?: MediaKind | undefined;
  title: {
    romaji?: string | undefined;
    english?: string | undefined;
    native?: string | undefined;
  };
  format?: string | undefined;
  source?: string | undefined;
  duration?: string | undefined;
  rating?: string | undefined;
  rank?: number | undefined;
  popularity?: number | undefined;
  members?: number | undefined;
  favorites?: number | undefined;
  unit_count?: number | undefined;
  volume_count?: number | undefined;
  chapter_count?: number | undefined;
  status?: string | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
  start_year?: number | undefined;
  end_year?: number | undefined;
  season?: MediaSeason | undefined;
  season_year?: number | undefined;
  cover_image?: string | undefined;
  banner_image?: string | undefined;
  description?: string | undefined;
  genres?: string[] | undefined;
  synonyms?: string[] | undefined;
  related_media?: MediaDiscoveryEntry[] | undefined;
  recommended_media?: MediaDiscoveryEntry[] | undefined;
  match_confidence?: number | undefined;
  match_reason?: string | undefined;
  already_in_library?: boolean | undefined;
}

export const MediaSearchResultTitleSchema = Schema.Struct({
  romaji: Schema.optional(Schema.String),
  english: Schema.optional(Schema.String),
  native: Schema.optional(Schema.String),
});

export const MediaSearchResultSchema = Schema.Struct({
  id: MediaIdSchema,
  media_kind: Schema.optional(MediaKindSchema),
  title: MediaSearchResultTitleSchema,
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
  season: Schema.optional(MediaSeasonSchema),
  season_year: Schema.optional(Schema.Number),
  cover_image: Schema.optional(Schema.String),
  banner_image: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  genres: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  synonyms: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  related_media: Schema.optional(Schema.mutable(Schema.Array(MediaDiscoveryEntrySchema))),
  recommended_media: Schema.optional(Schema.mutable(Schema.Array(MediaDiscoveryEntrySchema))),
  match_confidence: Schema.optional(Schema.Number),
  match_reason: Schema.optional(Schema.String),
  already_in_library: Schema.optional(Schema.Boolean),
});

export interface MediaSearchResponse {
  results: MediaSearchResult[];
  degraded: boolean;
}

export const MediaSearchResponseSchema = Schema.Struct({
  degraded: Schema.Boolean,
  results: Schema.mutable(Schema.Array(MediaSearchResultSchema)),
});
