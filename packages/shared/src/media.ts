// Shared media, media-unit, reader and calendar wire contracts.
import { Schema } from "effect";
import {
  MediaIdSchema,
  type MediaId,
  MediaKindSchema,
  type MediaKind,
  MediaUnitKindSchema,
  type MediaUnitKind,
  ReleaseProfileIdSchema,
  type ReleaseProfileId,
} from "./ids.ts";
import { Struct } from "effect";
import { ParsedUnitIdentitySchema, type ParsedUnitIdentity } from "./parsed-identity.ts";

export interface MediaUnitProgress {
  downloaded: number;
  downloaded_percent?: number | undefined;
  is_up_to_date?: boolean | undefined;
  latest_downloaded_unit?: number | undefined;
  total?: number | undefined;
  missing: number[];
  next_missing_unit?: number | undefined;
}

export const MediaUnitProgressSchema = Schema.Struct({
  downloaded: Schema.Number,
  downloaded_percent: Schema.optional(Schema.Number),
  is_up_to_date: Schema.optional(Schema.Boolean),
  latest_downloaded_unit: Schema.optional(Schema.Number),
  total: Schema.optional(Schema.Number),
  missing: Schema.mutable(Schema.Array(Schema.Number)),
  next_missing_unit: Schema.optional(Schema.Number),
}).mapFields(Struct.map(Schema.mutableKey));

export type MediaSeason = "winter" | "spring" | "summer" | "fall";

export const MediaSeasonSchema = Schema.Literals(["winter", "spring", "summer", "fall"]);

export const MediaTitleSchema = Schema.Struct({
  romaji: Schema.String,
  english: Schema.optional(Schema.String),
  native: Schema.optional(Schema.String),
});

export interface NextAiringUnit {
  unit_number: number;
  airing_at: string;
}

export const NextAiringUnitSchema = Schema.Struct({
  unit_number: Schema.Number,
  airing_at: Schema.String,
});

export interface MediaDiscoveryEntry {
  id: MediaId;
  title: {
    romaji?: string | undefined;
    english?: string | undefined;
    native?: string | undefined;
  };
  relation_type?: string | undefined;
  format?: string | undefined;
  status?: string | undefined;
  season?: MediaSeason | undefined;
  season_year?: number | undefined;
  start_year?: number | undefined;
  cover_image?: string | undefined;
  rating?: number | undefined;
}

export const MediaDiscoveryEntrySchema = Schema.Struct({
  id: MediaIdSchema,
  title: Schema.Struct({
    romaji: Schema.optional(Schema.String),
    english: Schema.optional(Schema.String),
    native: Schema.optional(Schema.String),
  }),
  relation_type: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  season: Schema.optional(MediaSeasonSchema),
  season_year: Schema.optional(Schema.Number),
  start_year: Schema.optional(Schema.Number),
  cover_image: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.Number),
});

export type UnitAiringStatus = "aired" | "future" | "unknown";

export const UnitAiringStatusSchema = Schema.Literals(["aired", "future", "unknown"]);

export interface Media {
  id: MediaId;
  media_kind: MediaKind;
  mal_id?: number | undefined;
  title: {
    romaji: string;
    english?: string | undefined;
    native?: string | undefined;
  };
  format: string;
  source?: string | undefined;
  description?: string | undefined;
  background?: string | undefined;
  duration?: string | undefined;
  rating?: string | undefined;
  rank?: number | undefined;
  popularity?: number | undefined;
  members?: number | undefined;
  favorites?: number | undefined;
  score?: number | undefined;
  genres?: string[] | undefined;
  studios?: string[] | undefined;
  cover_image?: string | undefined;
  banner_image?: string | undefined;
  status: string;
  unit_count?: number | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
  start_year?: number | undefined;
  end_year?: number | undefined;
  synonyms?: string[] | undefined;
  related_media?: MediaDiscoveryEntry[] | undefined;
  recommended_media?: MediaDiscoveryEntry[] | undefined;
  next_airing_unit?: NextAiringUnit | undefined;
  season?: MediaSeason | undefined;
  season_year?: number | undefined;
  profile_name: string;
  root_folder: string;
  added_at: string;
  monitored: boolean;
  release_profile_ids: ReleaseProfileId[];
  progress: MediaUnitProgress;
}

export const MediaSchema = Schema.Struct({
  id: MediaIdSchema,
  media_kind: MediaKindSchema,
  mal_id: Schema.optional(Schema.Number),
  title: MediaTitleSchema,
  format: Schema.String,
  source: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  background: Schema.optional(Schema.String),
  duration: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.String),
  rank: Schema.optional(Schema.Number),
  popularity: Schema.optional(Schema.Number),
  members: Schema.optional(Schema.Number),
  favorites: Schema.optional(Schema.Number),
  score: Schema.optional(Schema.Number),
  genres: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  studios: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  cover_image: Schema.optional(Schema.String),
  banner_image: Schema.optional(Schema.String),
  status: Schema.String,
  unit_count: Schema.optional(Schema.Number),
  start_date: Schema.optional(Schema.String),
  end_date: Schema.optional(Schema.String),
  start_year: Schema.optional(Schema.Number),
  end_year: Schema.optional(Schema.Number),
  synonyms: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  related_media: Schema.optional(Schema.mutable(Schema.Array(MediaDiscoveryEntrySchema))),
  recommended_media: Schema.optional(Schema.mutable(Schema.Array(MediaDiscoveryEntrySchema))),
  next_airing_unit: Schema.optional(NextAiringUnitSchema),
  season: Schema.optional(MediaSeasonSchema),
  season_year: Schema.optional(Schema.Number),
  profile_name: Schema.String,
  root_folder: Schema.String,
  added_at: Schema.String,
  monitored: Schema.Boolean,
  release_profile_ids: Schema.mutable(Schema.Array(ReleaseProfileIdSchema)),
  progress: MediaUnitProgressSchema,
}).mapFields(Struct.map(Schema.mutableKey));

export interface MediaListQueryParams {
  limit?: number | undefined;
  offset?: number | undefined;
  monitored?: boolean | undefined;
}

export const MediaListQueryParamsSchema = Schema.Struct({
  limit: Schema.optional(
    Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 500 }))),
  ),
  offset: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))),
  monitored: Schema.optional(Schema.Boolean),
});

export interface MediaListResponse {
  items: Media[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export const MediaListResponseSchema = Schema.Struct({
  items: Schema.mutable(Schema.Array(MediaSchema)),
  total: Schema.Number,
  limit: Schema.Number,
  offset: Schema.Number,
  has_more: Schema.Boolean,
});

export interface MediaUnit {
  unit_kind?: MediaUnitKind | null | undefined;
  number: number;
  title?: string | null | undefined;
  aired?: string | null | undefined;
  is_future?: boolean | null | undefined;
  airing_status?: UnitAiringStatus | null | undefined;
  downloaded: boolean;
  file_path?: string | null | undefined;
  file_size?: number | null | undefined;
  duration_seconds?: number | null | undefined;
  group?: string | null | undefined;
  resolution?: string | null | undefined;
  quality?: string | null | undefined;
  video_codec?: string | null | undefined;
  audio_codec?: string | null | undefined;
  audio_channels?: string | null | undefined;
}

export const MediaUnitSchema = Schema.Struct({
  unit_kind: Schema.optional(Schema.NullishOr(MediaUnitKindSchema)),
  number: Schema.Number,
  title: Schema.optional(Schema.NullishOr(Schema.String)),
  aired: Schema.optional(Schema.NullishOr(Schema.String)),
  is_future: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  airing_status: Schema.optional(Schema.NullishOr(UnitAiringStatusSchema)),
  downloaded: Schema.Boolean,
  file_path: Schema.optional(Schema.NullishOr(Schema.String)),
  file_size: Schema.optional(Schema.NullishOr(Schema.Number)),
  duration_seconds: Schema.optional(Schema.NullishOr(Schema.Number)),
  group: Schema.optional(Schema.NullishOr(Schema.String)),
  resolution: Schema.optional(Schema.NullishOr(Schema.String)),
  quality: Schema.optional(Schema.NullishOr(Schema.String)),
  video_codec: Schema.optional(Schema.NullishOr(Schema.String)),
  audio_codec: Schema.optional(Schema.NullishOr(Schema.String)),
  audio_channels: Schema.optional(Schema.NullishOr(Schema.String)),
});

export interface ReaderPage {
  index: number;
  page_number: number;
  url: string;
  media_type?: string | undefined;
}

export const ReaderPageSchema = Schema.Struct({
  index: Schema.Number,
  page_number: Schema.Number,
  url: Schema.String,
  media_type: Schema.optional(Schema.String),
});

export interface ReaderPagesResponse {
  pages: ReaderPage[];
}

export const ReaderPagesResponseSchema = Schema.Struct({
  pages: Schema.mutable(Schema.Array(ReaderPageSchema)),
});

export interface VideoFile {
  name: string;
  path: string;
  size: number;
  duration_seconds?: number | undefined;
  unit_number?: number | undefined;
  unit_numbers?: number[] | undefined;
  coverage_summary?: string | undefined;
  source_identity?: ParsedUnitIdentity | undefined;
  unit_title?: string | undefined;
  air_date?: string | undefined;
  group?: string | undefined;
  resolution?: string | undefined;
  quality?: string | undefined;
  video_codec?: string | undefined;
  audio_codec?: string | undefined;
  audio_channels?: string | undefined;
}

export const VideoFileSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  size: Schema.Number,
  duration_seconds: Schema.optional(Schema.Number),
  unit_number: Schema.optional(Schema.Number),
  unit_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  coverage_summary: Schema.optional(Schema.String),
  source_identity: Schema.optional(Schema.suspend(() => ParsedUnitIdentitySchema)),
  unit_title: Schema.optional(Schema.String),
  air_date: Schema.optional(Schema.String),
  group: Schema.optional(Schema.String),
  resolution: Schema.optional(Schema.String),
  quality: Schema.optional(Schema.String),
  video_codec: Schema.optional(Schema.String),
  audio_codec: Schema.optional(Schema.String),
  audio_channels: Schema.optional(Schema.String),
});

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  extended_props: {
    media_id: MediaId;
    media_title: string;
    unit_kind?: MediaUnitKind | null | undefined;
    unit_number: number;
    unit_title?: string | null | undefined;
    airing_status?: UnitAiringStatus | null | undefined;
    downloaded: boolean;
    is_future?: boolean | null | undefined;
    media_image?: string | null | undefined;
  };
}

export const CalendarEventExtendedPropsSchema = Schema.Struct({
  media_id: MediaIdSchema,
  media_title: Schema.String,
  unit_kind: Schema.optional(Schema.NullishOr(MediaUnitKindSchema)),
  unit_number: Schema.Number,
  unit_title: Schema.optional(Schema.NullishOr(Schema.String)),
  airing_status: Schema.optional(Schema.NullishOr(UnitAiringStatusSchema)),
  downloaded: Schema.Boolean,
  is_future: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  media_image: Schema.optional(Schema.NullishOr(Schema.String)),
});

export const CalendarEventSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  start: Schema.String,
  end: Schema.String,
  all_day: Schema.Boolean,
  extended_props: CalendarEventExtendedPropsSchema,
});

export interface MissingUnit {
  media_id: MediaId;
  media_title: string;
  unit_kind?: MediaUnitKind | null | undefined;
  unit_number: number;
  unit_title?: string | null | undefined;
  aired?: string | null | undefined;
  airing_status?: UnitAiringStatus | null | undefined;
  media_image?: string | null | undefined;
  is_future?: boolean | null | undefined;
  next_airing_unit?: NextAiringUnit | undefined;
}

export const MissingUnitSchema = Schema.Struct({
  media_id: MediaIdSchema,
  media_title: Schema.String,
  unit_kind: Schema.optional(Schema.NullishOr(MediaUnitKindSchema)),
  unit_number: Schema.Number,
  unit_title: Schema.optional(Schema.NullishOr(Schema.String)),
  aired: Schema.optional(Schema.NullishOr(Schema.String)),
  airing_status: Schema.optional(Schema.NullishOr(UnitAiringStatusSchema)),
  media_image: Schema.optional(Schema.NullishOr(Schema.String)),
  is_future: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  next_airing_unit: Schema.optional(NextAiringUnitSchema),
});
