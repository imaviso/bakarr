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
  downloaded_percent?: number | undefined | null;
  is_up_to_date?: boolean | undefined | null;
  latest_downloaded_unit?: number | undefined | null;
  total?: number | undefined | null;
  missing: number[];
  next_missing_unit?: number | undefined | null;
}

export const MediaUnitProgressSchema = Schema.Struct({
  downloaded: Schema.Number,
  downloaded_percent: Schema.optional(Schema.NullishOr(Schema.Number)),
  is_up_to_date: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  latest_downloaded_unit: Schema.optional(Schema.NullishOr(Schema.Number)),
  total: Schema.optional(Schema.NullishOr(Schema.Number)),
  missing: Schema.mutable(Schema.Array(Schema.Number)),
  next_missing_unit: Schema.optional(Schema.NullishOr(Schema.Number)),
}).mapFields(Struct.map(Schema.mutableKey));

export type MediaSeason = "winter" | "spring" | "summer" | "fall";

export const MediaSeasonSchema = Schema.Literals(["winter", "spring", "summer", "fall"]);

export const MediaTitleSchema = Schema.Struct({
  romaji: Schema.String,
  english: Schema.optional(Schema.NullishOr(Schema.String)),
  native: Schema.optional(Schema.NullishOr(Schema.String)),
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
    romaji?: string | undefined | null;
    english?: string | undefined | null;
    native?: string | undefined | null;
  };
  relation_type?: string | undefined | null;
  format?: string | undefined | null;
  status?: string | undefined | null;
  season?: MediaSeason | undefined | null;
  season_year?: number | undefined | null;
  start_year?: number | undefined | null;
  cover_image?: string | undefined | null;
  rating?: number | undefined | null;
}

export const MediaDiscoveryEntrySchema = Schema.Struct({
  id: MediaIdSchema,
  title: Schema.Struct({
    romaji: Schema.optional(Schema.NullishOr(Schema.String)),
    english: Schema.optional(Schema.NullishOr(Schema.String)),
    native: Schema.optional(Schema.NullishOr(Schema.String)),
  }),
  relation_type: Schema.optional(Schema.NullishOr(Schema.String)),
  format: Schema.optional(Schema.NullishOr(Schema.String)),
  status: Schema.optional(Schema.NullishOr(Schema.String)),
  season: Schema.optional(Schema.NullishOr(MediaSeasonSchema)),
  season_year: Schema.optional(Schema.NullishOr(Schema.Number)),
  start_year: Schema.optional(Schema.NullishOr(Schema.Number)),
  cover_image: Schema.optional(Schema.NullishOr(Schema.String)),
  rating: Schema.optional(Schema.NullishOr(Schema.Number)),
});

export type UnitAiringStatus = "aired" | "future" | "unknown";

export const UnitAiringStatusSchema = Schema.Literals(["aired", "future", "unknown"]);

export interface Media {
  id: MediaId;
  media_kind: MediaKind;
  mal_id?: number | undefined | null;
  title: {
    romaji: string;
    english?: string | undefined | null;
    native?: string | undefined | null;
  };
  format: string;
  source?: string | undefined | null;
  description?: string | undefined | null;
  background?: string | undefined | null;
  duration?: string | undefined | null;
  rating?: string | undefined | null;
  rank?: number | undefined | null;
  popularity?: number | undefined | null;
  members?: number | undefined | null;
  favorites?: number | undefined | null;
  score?: number | undefined | null;
  genres?: string[] | undefined | null;
  studios?: string[] | undefined | null;
  cover_image?: string | undefined | null;
  banner_image?: string | undefined | null;
  status: string;
  unit_count?: number | undefined | null;
  start_date?: string | undefined | null;
  end_date?: string | undefined | null;
  start_year?: number | undefined | null;
  end_year?: number | undefined | null;
  synonyms?: string[] | undefined | null;
  related_media?: MediaDiscoveryEntry[] | undefined | null;
  recommended_media?: MediaDiscoveryEntry[] | undefined | null;
  next_airing_unit?: NextAiringUnit | undefined | null;
  season?: MediaSeason | undefined | null;
  season_year?: number | undefined | null;
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
  mal_id: Schema.optional(Schema.NullishOr(Schema.Number)),
  title: MediaTitleSchema,
  format: Schema.String,
  source: Schema.optional(Schema.NullishOr(Schema.String)),
  description: Schema.optional(Schema.NullishOr(Schema.String)),
  background: Schema.optional(Schema.NullishOr(Schema.String)),
  duration: Schema.optional(Schema.NullishOr(Schema.String)),
  rating: Schema.optional(Schema.NullishOr(Schema.String)),
  rank: Schema.optional(Schema.NullishOr(Schema.Number)),
  popularity: Schema.optional(Schema.NullishOr(Schema.Number)),
  members: Schema.optional(Schema.NullishOr(Schema.Number)),
  favorites: Schema.optional(Schema.NullishOr(Schema.Number)),
  score: Schema.optional(Schema.NullishOr(Schema.Number)),
  genres: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.String)))),
  studios: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.String)))),
  cover_image: Schema.optional(Schema.NullishOr(Schema.String)),
  banner_image: Schema.optional(Schema.NullishOr(Schema.String)),
  status: Schema.String,
  unit_count: Schema.optional(Schema.NullishOr(Schema.Number)),
  start_date: Schema.optional(Schema.NullishOr(Schema.String)),
  end_date: Schema.optional(Schema.NullishOr(Schema.String)),
  start_year: Schema.optional(Schema.NullishOr(Schema.Number)),
  end_year: Schema.optional(Schema.NullishOr(Schema.Number)),
  synonyms: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.String)))),
  related_media: Schema.optional(
    Schema.NullishOr(Schema.mutable(Schema.Array(MediaDiscoveryEntrySchema))),
  ),
  recommended_media: Schema.optional(
    Schema.NullishOr(Schema.mutable(Schema.Array(MediaDiscoveryEntrySchema))),
  ),
  next_airing_unit: Schema.optional(Schema.NullishOr(NextAiringUnitSchema)),
  season: Schema.optional(Schema.NullishOr(MediaSeasonSchema)),
  season_year: Schema.optional(Schema.NullishOr(Schema.Number)),
  profile_name: Schema.String,
  root_folder: Schema.String,
  added_at: Schema.String,
  monitored: Schema.Boolean,
  release_profile_ids: Schema.mutable(Schema.Array(ReleaseProfileIdSchema)),
  progress: MediaUnitProgressSchema,
}).mapFields(Struct.map(Schema.mutableKey));

export interface MediaListQueryParams {
  limit?: number | undefined | null;
  offset?: number | undefined | null;
  monitored?: boolean | undefined | null;
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
  media_type?: string | undefined | null;
}

export const ReaderPageSchema = Schema.Struct({
  index: Schema.Number,
  page_number: Schema.Number,
  url: Schema.String,
  media_type: Schema.optional(Schema.NullishOr(Schema.String)),
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
  duration_seconds?: number | undefined | null;
  unit_number?: number | undefined | null;
  unit_numbers?: number[] | undefined | null;
  coverage_summary?: string | undefined | null;
  source_identity?: ParsedUnitIdentity | undefined | null;
  unit_title?: string | undefined | null;
  air_date?: string | undefined | null;
  group?: string | undefined | null;
  resolution?: string | undefined | null;
  quality?: string | undefined | null;
  video_codec?: string | undefined | null;
  audio_codec?: string | undefined | null;
  audio_channels?: string | undefined | null;
}

export const VideoFileSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  size: Schema.Number,
  duration_seconds: Schema.optional(Schema.NullishOr(Schema.Number)),
  unit_number: Schema.optional(Schema.NullishOr(Schema.Number)),
  unit_numbers: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.Number)))),
  coverage_summary: Schema.optional(Schema.NullishOr(Schema.String)),
  source_identity: Schema.optional(
    Schema.NullishOr(Schema.suspend(() => ParsedUnitIdentitySchema)),
  ),
  unit_title: Schema.optional(Schema.NullishOr(Schema.String)),
  air_date: Schema.optional(Schema.NullishOr(Schema.String)),
  group: Schema.optional(Schema.NullishOr(Schema.String)),
  resolution: Schema.optional(Schema.NullishOr(Schema.String)),
  quality: Schema.optional(Schema.NullishOr(Schema.String)),
  video_codec: Schema.optional(Schema.NullishOr(Schema.String)),
  audio_codec: Schema.optional(Schema.NullishOr(Schema.String)),
  audio_channels: Schema.optional(Schema.NullishOr(Schema.String)),
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
  next_airing_unit?: NextAiringUnit | undefined | null;
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
  next_airing_unit: Schema.optional(Schema.NullishOr(NextAiringUnitSchema)),
});
