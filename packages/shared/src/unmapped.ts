// Shared unmapped folder wire contracts.
import { Schema, Struct } from "effect";
import { MediaKindSchema, type MediaKind } from "./ids.ts";
import { MediaSearchResultSchema, type MediaSearchResult } from "./media-search.ts";

export const UNMAPPED_FOLDER_MATCH_STATUS_VALUES = [
  "pending",
  "matching",
  "paused",
  "done",
  "failed",
] as const;

export type UnmappedFolderMatchStatus = (typeof UNMAPPED_FOLDER_MATCH_STATUS_VALUES)[number];

export const UnmappedFolderMatchStatusSchema = Schema.Literals([
  ...UNMAPPED_FOLDER_MATCH_STATUS_VALUES,
]);

export const MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS = 3;

export interface UnmappedFolder {
  match_attempts?: number | undefined;
  last_match_error?: string | undefined;
  last_matched_at?: string | undefined;
  match_status?: UnmappedFolderMatchStatus | undefined;
  media_kind?: MediaKind | undefined;
  name: string;
  path: string;
  search_queries?: string[] | undefined;
  size: number;
  suggested_matches: MediaSearchResult[];
}

export const UnmappedFolderSchema = Schema.Struct({
  match_attempts: Schema.optional(Schema.Number),
  last_match_error: Schema.optional(Schema.String),
  last_matched_at: Schema.optional(Schema.String),
  match_status: Schema.optional(UnmappedFolderMatchStatusSchema),
  media_kind: Schema.optional(MediaKindSchema),
  name: Schema.String,
  path: Schema.String,
  search_queries: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  size: Schema.Number,
  suggested_matches: Schema.mutable(Schema.Array(MediaSearchResultSchema)),
}).mapFields(Struct.map(Schema.mutableKey));

export interface ScannerState {
  has_outstanding_matches: boolean;
  is_scanning: boolean;
  folders: UnmappedFolder[];
  last_updated?: string | undefined;
  match_status: ScannerMatchStatus;
  match_counts: ScannerMatchCounts;
}

export type ScannerMatchStatus = "running" | "retrying" | "queued" | "paused" | "failed" | "idle";

export const ScannerMatchStatusSchema = Schema.Literals([
  "running",
  "retrying",
  "queued",
  "paused",
  "failed",
  "idle",
]);

export interface ScannerMatchCounts {
  exact: number;
  queued: number;
  matching: number;
  matched: number;
  failed: number;
  paused: number;
}

export const ScannerMatchCountsSchema = Schema.Struct({
  exact: Schema.Number,
  queued: Schema.Number,
  matching: Schema.Number,
  matched: Schema.Number,
  failed: Schema.Number,
  paused: Schema.Number,
});

export const ScannerStateSchema = Schema.Struct({
  has_outstanding_matches: Schema.Boolean,
  is_scanning: Schema.Boolean,
  folders: Schema.mutable(Schema.Array(UnmappedFolderSchema)),
  last_updated: Schema.optional(Schema.String),
  match_status: ScannerMatchStatusSchema,
  match_counts: ScannerMatchCountsSchema,
}).mapFields(Struct.map(Schema.mutableKey));
