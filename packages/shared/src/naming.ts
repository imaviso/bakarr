// Shared naming and rename wire contracts.
import { Schema, Struct } from "effect";
import { ParsedUnitIdentitySchema, type ParsedUnitIdentity } from "./parsed-identity.ts";
import { StringListSchema } from "./config.ts";

export type NamingTitleSource =
  | "preferred_english"
  | "preferred_native"
  | "preferred_romaji"
  | "fallback_english"
  | "fallback_native"
  | "fallback_romaji";

export const NamingTitleSourceSchema = Schema.Literals([
  "preferred_english",
  "preferred_native",
  "preferred_romaji",
  "fallback_english",
  "fallback_native",
  "fallback_romaji",
]);

export interface RenamePreviewMetadataSnapshot {
  title: string;
  title_source?: NamingTitleSource | undefined | null;
  season?: number | undefined | null;
  year?: number | undefined | null;
  unit_title?: string | undefined | null;
  air_date?: string | undefined | null;
  group?: string | undefined | null;
  resolution?: string | undefined | null;
  quality?: string | undefined | null;
  video_codec?: string | undefined | null;
  audio_codec?: string | undefined | null;
  audio_channels?: string | undefined | null;
  source_identity?: ParsedUnitIdentity | undefined | null;
}

export const RenamePreviewMetadataSnapshotSchema = Schema.Struct({
  title: Schema.String,
  title_source: Schema.optional(Schema.NullishOr(NamingTitleSourceSchema)),
  season: Schema.optional(Schema.NullishOr(Schema.Number)),
  year: Schema.optional(Schema.NullishOr(Schema.Number)),
  unit_title: Schema.optional(Schema.NullishOr(Schema.String)),
  air_date: Schema.optional(Schema.NullishOr(Schema.String)),
  group: Schema.optional(Schema.NullishOr(Schema.String)),
  resolution: Schema.optional(Schema.NullishOr(Schema.String)),
  quality: Schema.optional(Schema.NullishOr(Schema.String)),
  video_codec: Schema.optional(Schema.NullishOr(Schema.String)),
  audio_codec: Schema.optional(Schema.NullishOr(Schema.String)),
  audio_channels: Schema.optional(Schema.NullishOr(Schema.String)),
  source_identity: Schema.optional(
    Schema.NullishOr(Schema.suspend(() => ParsedUnitIdentitySchema)),
  ),
});

export interface RenamePreviewItem {
  unit_number: number;
  unit_numbers?: number[] | undefined | null;
  current_path: string;
  new_path: string;
  new_filename: string;
  format_used?: string | undefined | null;
  fallback_used?: boolean | undefined | null;
  warnings?: string[] | undefined | null;
  missing_fields?: string[] | undefined | null;
  metadata_snapshot?: RenamePreviewMetadataSnapshot | undefined | null;
}

export const RenamePreviewItemSchema = Schema.Struct({
  unit_number: Schema.Number,
  unit_numbers: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.Number)))),
  current_path: Schema.String,
  new_path: Schema.String,
  new_filename: Schema.String,
  format_used: Schema.optional(Schema.NullishOr(Schema.String)),
  fallback_used: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  warnings: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.String)))),
  missing_fields: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.String)))),
  metadata_snapshot: Schema.optional(Schema.NullishOr(RenamePreviewMetadataSnapshotSchema)),
});

export interface RenameResult {
  renamed: number;
  failed: number;
  failures: string[];
}

export const RenameResultSchema = Schema.Struct({
  renamed: Schema.Number,
  failed: Schema.Number,
  failures: StringListSchema,
}).mapFields(Struct.map(Schema.mutableKey));
