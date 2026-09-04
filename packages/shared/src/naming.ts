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
  title_source?: NamingTitleSource | undefined;
  season?: number | undefined;
  year?: number | undefined;
  unit_title?: string | undefined;
  air_date?: string | undefined;
  group?: string | undefined;
  resolution?: string | undefined;
  quality?: string | undefined;
  video_codec?: string | undefined;
  audio_codec?: string | undefined;
  audio_channels?: string | undefined;
  source_identity?: ParsedUnitIdentity | undefined;
}

export const RenamePreviewMetadataSnapshotSchema = Schema.Struct({
  title: Schema.String,
  title_source: Schema.optional(NamingTitleSourceSchema),
  season: Schema.optional(Schema.Number),
  year: Schema.optional(Schema.Number),
  unit_title: Schema.optional(Schema.String),
  air_date: Schema.optional(Schema.String),
  group: Schema.optional(Schema.String),
  resolution: Schema.optional(Schema.String),
  quality: Schema.optional(Schema.String),
  video_codec: Schema.optional(Schema.String),
  audio_codec: Schema.optional(Schema.String),
  audio_channels: Schema.optional(Schema.String),
  source_identity: Schema.optional(Schema.suspend(() => ParsedUnitIdentitySchema)),
});

export interface RenamePreviewItem {
  unit_number: number;
  unit_numbers?: number[] | undefined;
  current_path: string;
  new_path: string;
  new_filename: string;
  format_used?: string | undefined;
  fallback_used?: boolean | undefined;
  warnings?: string[] | undefined;
  missing_fields?: string[] | undefined;
  metadata_snapshot?: RenamePreviewMetadataSnapshot | undefined;
}

export const RenamePreviewItemSchema = Schema.Struct({
  unit_number: Schema.Number,
  unit_numbers: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  current_path: Schema.String,
  new_path: Schema.String,
  new_filename: Schema.String,
  format_used: Schema.optional(Schema.String),
  fallback_used: Schema.optional(Schema.Boolean),
  warnings: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  missing_fields: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  metadata_snapshot: Schema.optional(RenamePreviewMetadataSnapshotSchema),
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
