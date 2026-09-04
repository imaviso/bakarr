// Shared library scan and import wire contracts.
import { Schema, Struct } from "effect";
import { MediaIdSchema, type MediaId } from "./ids.ts";
import { ParsedUnitIdentitySchema, type ParsedUnitIdentity } from "./parsed-identity.ts";
import { StringListSchema } from "./config.ts";
import {
  RenamePreviewMetadataSnapshotSchema,
  type RenamePreviewMetadataSnapshot,
} from "./naming.ts";
import { FileUnitMappingSchema, type FileUnitMapping } from "./file-mapping.ts";
import { DownloadSourceMetadataSchema, type DownloadSourceMetadata } from "./source-metadata.ts";
import { MediaSearchResultSchema, type MediaSearchResult } from "./media-search.ts";

export interface ScannedFile {
  source_path: string;
  filename: string;
  size?: number | undefined;
  parsed_title: string;
  unit_number: number;
  unit_numbers?: number[] | undefined;
  coverage_summary?: string | undefined;
  unit_title?: string | undefined;
  air_date?: string | undefined;
  season?: number | undefined;
  group?: string | undefined;
  resolution?: string | undefined;
  quality?: string | undefined;
  video_codec?: string | undefined;
  audio_codec?: string | undefined;
  audio_channels?: string | undefined;
  duration_seconds?: number | undefined;
  matched_media?:
    | {
        id: MediaId;
        title: string;
      }
    | undefined;
  suggested_candidate_id?: MediaId | undefined;
  match_confidence?: number | undefined;
  match_reason?: string | undefined;
  existing_mapping?: FileUnitMapping | undefined;
  unit_conflict?: FileUnitMapping | undefined;
  source_identity?: ParsedUnitIdentity | undefined;
  skip_reason?: string | undefined;
  needs_manual_mapping?: boolean | undefined;
  warnings?: string[] | undefined;
  naming_filename?: string | undefined;
  naming_format_used?: string | undefined;
  naming_fallback_used?: boolean | undefined;
  naming_warnings?: string[] | undefined;
  naming_missing_fields?: string[] | undefined;
  naming_metadata_snapshot?: RenamePreviewMetadataSnapshot | undefined;
}

export const ScannedFileMatchedMediaSchema = Schema.Struct({
  id: MediaIdSchema,
  title: Schema.String,
});

export const ScannedFileSchema = Schema.Struct({
  source_path: Schema.String,
  filename: Schema.String,
  size: Schema.optional(Schema.Number),
  parsed_title: Schema.String,
  unit_number: Schema.Number,
  unit_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  coverage_summary: Schema.optional(Schema.String),
  unit_title: Schema.optional(Schema.String),
  air_date: Schema.optional(Schema.String),
  season: Schema.optional(Schema.Number),
  group: Schema.optional(Schema.String),
  resolution: Schema.optional(Schema.String),
  quality: Schema.optional(Schema.String),
  video_codec: Schema.optional(Schema.String),
  audio_codec: Schema.optional(Schema.String),
  audio_channels: Schema.optional(Schema.String),
  duration_seconds: Schema.optional(Schema.Number),
  matched_media: Schema.optional(ScannedFileMatchedMediaSchema),
  suggested_candidate_id: Schema.optional(MediaIdSchema),
  match_confidence: Schema.optional(Schema.Number),
  match_reason: Schema.optional(Schema.String),
  existing_mapping: Schema.optional(FileUnitMappingSchema),
  unit_conflict: Schema.optional(FileUnitMappingSchema),
  source_identity: Schema.optional(ParsedUnitIdentitySchema),
  skip_reason: Schema.optional(Schema.String),
  needs_manual_mapping: Schema.optional(Schema.Boolean),
  warnings: Schema.optional(StringListSchema),
  naming_filename: Schema.optional(Schema.String),
  naming_format_used: Schema.optional(Schema.String),
  naming_fallback_used: Schema.optional(Schema.Boolean),
  naming_warnings: Schema.optional(StringListSchema),
  naming_missing_fields: Schema.optional(StringListSchema),
  naming_metadata_snapshot: Schema.optional(RenamePreviewMetadataSnapshotSchema),
});

export interface SkippedFile {
  path: string;
  reason: string;
}

export const SkippedFileSchema = Schema.Struct({
  path: Schema.String,
  reason: Schema.String,
});

export interface ScanResult {
  files: ScannedFile[];
  skipped: SkippedFile[];
  candidates: MediaSearchResult[];
  truncated?: boolean | undefined;
  total_scanned?: number | undefined;
}

export const ScanResultSchema = Schema.Struct({
  files: Schema.mutable(Schema.Array(ScannedFileSchema)),
  skipped: Schema.mutable(Schema.Array(SkippedFileSchema)),
  candidates: Schema.mutable(Schema.Array(Schema.suspend(() => MediaSearchResultSchema))),
  truncated: Schema.optional(Schema.Boolean),
  total_scanned: Schema.optional(Schema.Number),
}).mapFields(Struct.map(Schema.mutableKey));

export interface ImportedFile {
  source_path: string;
  destination_path: string;
  media_id: MediaId;
  unit_number: number;
  unit_numbers?: number[] | undefined;
  naming_format_used?: string | undefined;
  naming_fallback_used?: boolean | undefined;
  naming_warnings?: string[] | undefined;
  naming_missing_fields?: string[] | undefined;
  naming_metadata_snapshot?: RenamePreviewMetadataSnapshot | undefined;
}

export const ImportedFileSchema = Schema.Struct({
  source_path: Schema.String,
  destination_path: Schema.String,
  media_id: MediaIdSchema,
  unit_number: Schema.Number,
  unit_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  naming_format_used: Schema.optional(Schema.String),
  naming_fallback_used: Schema.optional(Schema.Boolean),
  naming_warnings: Schema.optional(StringListSchema),
  naming_missing_fields: Schema.optional(StringListSchema),
  naming_metadata_snapshot: Schema.optional(RenamePreviewMetadataSnapshotSchema),
});

export interface FailedImport {
  source_path: string;
  error: string;
}

export const FailedImportSchema = Schema.Struct({
  source_path: Schema.String,
  error: Schema.String,
});

export interface ImportResult {
  imported: number;
  failed: number;
  imported_files: ImportedFile[];
  failed_files: FailedImport[];
}

export const ImportResultSchema = Schema.Struct({
  imported: Schema.Number,
  failed: Schema.Number,
  imported_files: Schema.mutable(Schema.Array(ImportedFileSchema)),
  failed_files: Schema.mutable(Schema.Array(FailedImportSchema)),
}).mapFields(Struct.map(Schema.mutableKey));

export interface ImportFileSelection {
  media_id: MediaId;
  unit_number: number;
  unit_numbers?: number[] | undefined;
  season?: number | undefined;
  source_metadata?: DownloadSourceMetadata | undefined;
  source_path: string;
}

export const ImportFileSelectionSchema = Schema.Struct({
  media_id: MediaIdSchema,
  unit_number: Schema.Number,
  unit_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  season: Schema.optional(Schema.Number),
  source_metadata: Schema.optional(Schema.suspend(() => DownloadSourceMetadataSchema)),
  source_path: Schema.String,
});

export interface ImportCandidateSelectionRequest {
  candidate_id: MediaId;
  candidate_title: string;
  force_select?: boolean | undefined;
  files: ScannedFile[];
  selected_candidate_ids: MediaId[];
  selected_files: ImportFileSelection[];
}

export const ImportCandidateSelectionRequestSchema = Schema.Struct({
  candidate_id: MediaIdSchema,
  candidate_title: Schema.String,
  force_select: Schema.optional(Schema.Boolean),
  files: Schema.mutable(Schema.Array(ScannedFileSchema)),
  selected_candidate_ids: Schema.mutable(Schema.Array(MediaIdSchema)),
  selected_files: Schema.mutable(Schema.Array(ImportFileSelectionSchema)),
});

export interface ImportCandidateSelectionResult {
  selected_candidate_ids: MediaId[];
  selected_files: ImportFileSelection[];
}

export const ImportCandidateSelectionResultSchema = Schema.Struct({
  selected_candidate_ids: Schema.mutable(Schema.Array(MediaIdSchema)),
  selected_files: Schema.mutable(Schema.Array(ImportFileSelectionSchema)),
});
