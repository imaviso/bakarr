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
  size?: number | undefined | null;
  parsed_title: string;
  unit_number: number;
  unit_numbers?: number[] | undefined | null;
  coverage_summary?: string | undefined | null;
  unit_title?: string | undefined | null;
  air_date?: string | undefined | null;
  season?: number | undefined | null;
  group?: string | undefined | null;
  resolution?: string | undefined | null;
  quality?: string | undefined | null;
  video_codec?: string | undefined | null;
  audio_codec?: string | undefined | null;
  audio_channels?: string | undefined | null;
  duration_seconds?: number | undefined | null;
  matched_media?:
    | {
        id: MediaId;
        title: string;
      }
    | null
    | undefined;
  suggested_candidate_id?: MediaId | undefined | null;
  match_confidence?: number | undefined | null;
  match_reason?: string | undefined | null;
  existing_mapping?: FileUnitMapping | undefined | null;
  unit_conflict?: FileUnitMapping | undefined | null;
  source_identity?: ParsedUnitIdentity | undefined | null;
  skip_reason?: string | undefined | null;
  needs_manual_mapping?: boolean | undefined | null;
  warnings?: string[] | undefined | null;
  naming_filename?: string | undefined | null;
  naming_format_used?: string | undefined | null;
  naming_fallback_used?: boolean | undefined | null;
  naming_warnings?: string[] | undefined | null;
  naming_missing_fields?: string[] | undefined | null;
  naming_metadata_snapshot?: RenamePreviewMetadataSnapshot | undefined | null;
}

export const ScannedFileMatchedMediaSchema = Schema.Struct({
  id: MediaIdSchema,
  title: Schema.String,
});

export const ScannedFileSchema = Schema.Struct({
  source_path: Schema.String,
  filename: Schema.String,
  size: Schema.optional(Schema.NullishOr(Schema.Number)),
  parsed_title: Schema.String,
  unit_number: Schema.Number,
  unit_numbers: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.Number)))),
  coverage_summary: Schema.optional(Schema.NullishOr(Schema.String)),
  unit_title: Schema.optional(Schema.NullishOr(Schema.String)),
  air_date: Schema.optional(Schema.NullishOr(Schema.String)),
  season: Schema.optional(Schema.NullishOr(Schema.Number)),
  group: Schema.optional(Schema.NullishOr(Schema.String)),
  resolution: Schema.optional(Schema.NullishOr(Schema.String)),
  quality: Schema.optional(Schema.NullishOr(Schema.String)),
  video_codec: Schema.optional(Schema.NullishOr(Schema.String)),
  audio_codec: Schema.optional(Schema.NullishOr(Schema.String)),
  audio_channels: Schema.optional(Schema.NullishOr(Schema.String)),
  duration_seconds: Schema.optional(Schema.NullishOr(Schema.Number)),
  matched_media: Schema.optional(Schema.NullishOr(ScannedFileMatchedMediaSchema)),
  suggested_candidate_id: Schema.optional(Schema.NullishOr(MediaIdSchema)),
  match_confidence: Schema.optional(Schema.NullishOr(Schema.Number)),
  match_reason: Schema.optional(Schema.NullishOr(Schema.String)),
  existing_mapping: Schema.optional(Schema.NullishOr(FileUnitMappingSchema)),
  unit_conflict: Schema.optional(Schema.NullishOr(FileUnitMappingSchema)),
  source_identity: Schema.optional(Schema.NullishOr(ParsedUnitIdentitySchema)),
  skip_reason: Schema.optional(Schema.NullishOr(Schema.String)),
  needs_manual_mapping: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  warnings: Schema.optional(Schema.NullishOr(StringListSchema)),
  naming_filename: Schema.optional(Schema.NullishOr(Schema.String)),
  naming_format_used: Schema.optional(Schema.NullishOr(Schema.String)),
  naming_fallback_used: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  naming_warnings: Schema.optional(Schema.NullishOr(StringListSchema)),
  naming_missing_fields: Schema.optional(Schema.NullishOr(StringListSchema)),
  naming_metadata_snapshot: Schema.optional(Schema.NullishOr(RenamePreviewMetadataSnapshotSchema)),
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
  truncated?: boolean | undefined | null;
  total_scanned?: number | undefined | null;
}

export const ScanResultSchema = Schema.Struct({
  files: Schema.mutable(Schema.Array(ScannedFileSchema)),
  skipped: Schema.mutable(Schema.Array(SkippedFileSchema)),
  candidates: Schema.mutable(Schema.Array(Schema.suspend(() => MediaSearchResultSchema))),
  truncated: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  total_scanned: Schema.optional(Schema.NullishOr(Schema.Number)),
}).mapFields(Struct.map(Schema.mutableKey));

export interface ImportedFile {
  source_path: string;
  destination_path: string;
  media_id: MediaId;
  unit_number: number;
  unit_numbers?: number[] | undefined | null;
  naming_format_used?: string | undefined | null;
  naming_fallback_used?: boolean | undefined | null;
  naming_warnings?: string[] | undefined | null;
  naming_missing_fields?: string[] | undefined | null;
  naming_metadata_snapshot?: RenamePreviewMetadataSnapshot | undefined | null;
}

export const ImportedFileSchema = Schema.Struct({
  source_path: Schema.String,
  destination_path: Schema.String,
  media_id: MediaIdSchema,
  unit_number: Schema.Number,
  unit_numbers: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.Number)))),
  naming_format_used: Schema.optional(Schema.NullishOr(Schema.String)),
  naming_fallback_used: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  naming_warnings: Schema.optional(Schema.NullishOr(StringListSchema)),
  naming_missing_fields: Schema.optional(Schema.NullishOr(StringListSchema)),
  naming_metadata_snapshot: Schema.optional(Schema.NullishOr(RenamePreviewMetadataSnapshotSchema)),
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
  unit_numbers?: number[] | undefined | null;
  season?: number | undefined | null;
  source_metadata?: DownloadSourceMetadata | undefined | null;
  source_path: string;
}

export const ImportFileSelectionSchema = Schema.Struct({
  media_id: MediaIdSchema,
  unit_number: Schema.Number,
  unit_numbers: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.Number)))),
  season: Schema.optional(Schema.NullishOr(Schema.Number)),
  source_metadata: Schema.optional(
    Schema.NullishOr(Schema.suspend(() => DownloadSourceMetadataSchema)),
  ),
  source_path: Schema.String,
});

export interface ImportCandidateSelectionRequest {
  candidate_id: MediaId;
  candidate_title: string;
  force_select?: boolean | undefined | null;
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
