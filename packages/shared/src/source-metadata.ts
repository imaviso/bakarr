// Shared download source metadata wire contracts.
import { Schema } from "effect";
import { ParsedUnitIdentitySchema, type ParsedUnitIdentity } from "./parsed-identity.ts";

export type DownloadSelectionKind = "manual" | "accept" | "upgrade";

export const DownloadSelectionKindSchema = Schema.Literals(["manual", "accept", "upgrade"]);

export interface DownloadSourceMetadata {
  parsed_title?: string | undefined;
  source_identity?: ParsedUnitIdentity | undefined;
  decision_reason?: string | undefined;
  selection_kind?: DownloadSelectionKind | undefined;
  selection_score?: number | undefined;
  previous_quality?: string | undefined;
  previous_score?: number | undefined;
  chosen_from_seadex?: boolean | undefined;
  unit_title?: string | undefined;
  air_date?: string | undefined;
  group?: string | undefined;
  resolution?: string | undefined;
  quality?: string | undefined;
  video_codec?: string | undefined;
  audio_codec?: string | undefined;
  audio_channels?: string | undefined;
  trusted?: boolean | undefined;
  remake?: boolean | undefined;
  source_url?: string | undefined;
  indexer?: string | undefined;
  is_seadex?: boolean | undefined;
  is_seadex_best?: boolean | undefined;
  seadex_release_group?: string | undefined;
  seadex_tags?: string[] | undefined;
  seadex_notes?: string | undefined;
  seadex_comparison?: string | undefined;
  seadex_dual_audio?: boolean | undefined;
}

export const DownloadSourceMetadataSchema = Schema.Struct({
  parsed_title: Schema.optional(Schema.String),
  source_identity: Schema.optional(ParsedUnitIdentitySchema),
  decision_reason: Schema.optional(Schema.String),
  selection_kind: Schema.optional(DownloadSelectionKindSchema),
  selection_score: Schema.optional(Schema.Number),
  previous_quality: Schema.optional(Schema.String),
  previous_score: Schema.optional(Schema.Number),
  chosen_from_seadex: Schema.optional(Schema.Boolean),
  unit_title: Schema.optional(Schema.String),
  air_date: Schema.optional(Schema.String),
  group: Schema.optional(Schema.String),
  resolution: Schema.optional(Schema.String),
  quality: Schema.optional(Schema.String),
  video_codec: Schema.optional(Schema.String),
  audio_codec: Schema.optional(Schema.String),
  audio_channels: Schema.optional(Schema.String),
  trusted: Schema.optional(Schema.Boolean),
  remake: Schema.optional(Schema.Boolean),
  source_url: Schema.optional(Schema.String),
  indexer: Schema.optional(Schema.String),
  is_seadex: Schema.optional(Schema.Boolean),
  is_seadex_best: Schema.optional(Schema.Boolean),
  seadex_release_group: Schema.optional(Schema.String),
  seadex_tags: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  seadex_notes: Schema.optional(Schema.String),
  seadex_comparison: Schema.optional(Schema.String),
  seadex_dual_audio: Schema.optional(Schema.Boolean),
});
