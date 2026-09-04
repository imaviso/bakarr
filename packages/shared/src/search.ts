// Shared release search wire contracts.
import { Schema, Struct } from "effect";
import { MediaIdSchema, type MediaId, MediaUnitKindSchema, type MediaUnitKind } from "./ids.ts";
import { StringListSchema } from "./config.ts";
import { DownloadActionSchema, type DownloadAction } from "./download-action.ts";

export interface SearchDownloadReleaseContext {
  group?: string | undefined;
  indexer?: string | undefined;
  info_hash?: string | undefined;
  parsed_resolution?: string | undefined;
  trusted?: boolean | undefined;
  remake?: boolean | undefined;
  source_url?: string | undefined;
  is_seadex?: boolean | undefined;
  is_seadex_best?: boolean | undefined;
  seadex_release_group?: string | undefined;
  seadex_tags?: string[] | undefined;
  seadex_notes?: string | undefined;
  seadex_comparison?: string | undefined;
  seadex_dual_audio?: boolean | undefined;
  download_action?: DownloadAction | undefined;
}

export const SearchDownloadReleaseContextSchema = Schema.Struct({
  group: Schema.optional(Schema.String),
  indexer: Schema.optional(Schema.String),
  info_hash: Schema.optional(Schema.String),
  parsed_resolution: Schema.optional(Schema.String),
  trusted: Schema.optional(Schema.Boolean),
  remake: Schema.optional(Schema.Boolean),
  source_url: Schema.optional(Schema.String),
  is_seadex: Schema.optional(Schema.Boolean),
  is_seadex_best: Schema.optional(Schema.Boolean),
  seadex_release_group: Schema.optional(Schema.String),
  seadex_tags: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  seadex_notes: Schema.optional(Schema.String),
  seadex_comparison: Schema.optional(Schema.String),
  seadex_dual_audio: Schema.optional(Schema.Boolean),
  download_action: Schema.optional(DownloadActionSchema),
});

export interface SearchDownloadRequest {
  media_id: MediaId;
  magnet: string;
  title: string;
  unit_number?: number | undefined;
  is_batch?: boolean | undefined;
  release_context?: SearchDownloadReleaseContext | undefined;
}

export const SearchDownloadRequestSchema = Schema.Struct({
  media_id: MediaIdSchema,
  magnet: Schema.String,
  title: Schema.String,
  unit_number: Schema.optional(Schema.Number),
  is_batch: Schema.optional(Schema.Boolean),
  release_context: Schema.optional(SearchDownloadReleaseContextSchema),
});

export interface NyaaSearchResult {
  title: string;
  indexer: string;
  magnet: string;
  info_hash: string;
  size: string;
  seeders: number;
  leechers: number;
  pub_date: string;
  view_url: string;
  parsed_unit?: string | undefined;
  parsed_group?: string | undefined;
  parsed_quality?: string | undefined;
  parsed_resolution?: string | undefined;
  parsed_unit_label?: string | undefined;
  parsed_unit_numbers?: number[] | undefined;
  parsed_air_date?: string | undefined;
  trusted: boolean;
  is_seadex: boolean;
  is_seadex_best: boolean;
  seadex_release_group?: string | undefined;
  seadex_tags?: string[] | undefined;
  seadex_notes?: string | undefined;
  seadex_comparison?: string | undefined;
  seadex_dual_audio?: boolean | undefined;
  remake: boolean;
}

export const NyaaSearchResultSchema = Schema.Struct({
  title: Schema.String,
  indexer: Schema.String,
  magnet: Schema.String,
  info_hash: Schema.String,
  size: Schema.String,
  seeders: Schema.Number,
  leechers: Schema.Number,
  pub_date: Schema.String,
  view_url: Schema.String,
  parsed_unit: Schema.optional(Schema.String),
  parsed_group: Schema.optional(Schema.String),
  parsed_quality: Schema.optional(Schema.String),
  parsed_resolution: Schema.optional(Schema.String),
  parsed_unit_label: Schema.optional(Schema.String),
  parsed_unit_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  parsed_air_date: Schema.optional(Schema.String),
  trusted: Schema.Boolean,
  is_seadex: Schema.Boolean,
  is_seadex_best: Schema.Boolean,
  seadex_release_group: Schema.optional(Schema.String),
  seadex_tags: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  seadex_notes: Schema.optional(Schema.String),
  seadex_comparison: Schema.optional(Schema.String),
  seadex_dual_audio: Schema.optional(Schema.Boolean),
  remake: Schema.Boolean,
});

export interface UnitSearchResult {
  unit_kind?: MediaUnitKind | undefined;
  title: string;
  indexer: string;
  link: string;
  info_hash: string;
  size: number;
  seeders: number;
  leechers: number;
  publish_date: string;
  download_action: DownloadAction;
  quality: string;
  group?: string | undefined;
  parsed_resolution?: string | undefined;
  parsed_unit_label?: string | undefined;
  parsed_unit_numbers?: number[] | undefined;
  parsed_air_date?: string | undefined;
  trusted?: boolean | undefined;
  remake?: boolean | undefined;
  view_url?: string | undefined;
  is_seadex?: boolean | undefined;
  is_seadex_best?: boolean | undefined;
  seadex_release_group?: string | undefined;
  seadex_comparison?: string | undefined;
  seadex_dual_audio?: boolean | undefined;
  seadex_tags?: string[] | undefined;
  seadex_notes?: string | undefined;
}

export const UnitSearchResultSchema = Schema.Struct({
  unit_kind: Schema.optional(MediaUnitKindSchema),
  title: Schema.String,
  indexer: Schema.String,
  link: Schema.String,
  info_hash: Schema.String,
  size: Schema.Number,
  seeders: Schema.Number,
  leechers: Schema.Number,
  publish_date: Schema.String,
  download_action: DownloadActionSchema,
  quality: Schema.String,
  group: Schema.optional(Schema.String),
  parsed_resolution: Schema.optional(Schema.String),
  parsed_unit_label: Schema.optional(Schema.String),
  parsed_unit_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  parsed_air_date: Schema.optional(Schema.String),
  trusted: Schema.optional(Schema.Boolean),
  remake: Schema.optional(Schema.Boolean),
  view_url: Schema.optional(Schema.String),
  is_seadex: Schema.optional(Schema.Boolean),
  is_seadex_best: Schema.optional(Schema.Boolean),
  seadex_release_group: Schema.optional(Schema.String),
  seadex_comparison: Schema.optional(Schema.String),
  seadex_dual_audio: Schema.optional(Schema.Boolean),
  seadex_tags: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  seadex_notes: Schema.optional(Schema.String),
});

export interface SearchResults {
  results: NyaaSearchResult[];
  seadex_groups: string[];
}

export const SEARCH_RELEASE_CATEGORY_OPTIONS = [
  "all_anime",
  "anime_english",
  "anime_non_english",
  "anime_raw",
  "all_literature",
  "literature_english",
  "literature_non_english",
  "literature_raw",
] as const;

export type SearchReleaseCategory = (typeof SEARCH_RELEASE_CATEGORY_OPTIONS)[number];

export const SEARCH_RELEASE_CATEGORY_LABELS: Record<SearchReleaseCategory, string> = {
  all_anime: "All Anime",
  anime_english: "Anime (English)",
  anime_non_english: "Anime (Non-Eng)",
  anime_raw: "Anime (Raw)",
  all_literature: "All Literature",
  literature_english: "Literature (English)",
  literature_non_english: "Literature (Non-Eng)",
  literature_raw: "Literature (Raw)",
};

export const SEARCH_RELEASE_FILTER_OPTIONS = ["no_filter", "no_remakes", "trusted_only"] as const;

export type SearchReleaseFilter = (typeof SEARCH_RELEASE_FILTER_OPTIONS)[number];

export const SEARCH_RELEASE_FILTER_LABELS: Record<SearchReleaseFilter, string> = {
  no_filter: "No Filter",
  no_remakes: "No Remakes",
  trusted_only: "Trusted Only",
};

export const DOWNLOAD_EVENT_TYPE_FILTER_OPTIONS = [
  "all",
  "download.queued",
  "download.imported",
  "download.imported.batch",
  "download.retried",
  "download.status_changed",
  "download.coverage_refined",
  "download.deleted",
  "download.search_missing.queued",
  "download.rss.queued",
] as const;

export type DownloadEventTypeFilterOption = (typeof DOWNLOAD_EVENT_TYPE_FILTER_OPTIONS)[number];

export const SearchResultsSchema = Schema.Struct({
  results: Schema.mutable(Schema.Array(NyaaSearchResultSchema)),
  seadex_groups: StringListSchema,
}).mapFields(Struct.map(Schema.mutableKey));
