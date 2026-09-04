// Shared download source metadata wire contracts.
import { Schema } from "effect";
import { ParsedUnitIdentitySchema, type ParsedUnitIdentity } from "./parsed-identity.ts";

export type DownloadSelectionKind = "manual" | "accept" | "upgrade";

export const DownloadSelectionKindSchema = Schema.Literals(["manual", "accept", "upgrade"]);

export interface DownloadSourceMetadata {
  parsed_title?: string | undefined | null;
  source_identity?: ParsedUnitIdentity | undefined | null;
  decision_reason?: string | undefined | null;
  selection_kind?: DownloadSelectionKind | undefined | null;
  selection_score?: number | undefined | null;
  previous_quality?: string | undefined | null;
  previous_score?: number | undefined | null;
  chosen_from_seadex?: boolean | undefined | null;
  unit_title?: string | undefined | null;
  air_date?: string | undefined | null;
  group?: string | undefined | null;
  resolution?: string | undefined | null;
  quality?: string | undefined | null;
  video_codec?: string | undefined | null;
  audio_codec?: string | undefined | null;
  audio_channels?: string | undefined | null;
  trusted?: boolean | undefined | null;
  remake?: boolean | undefined | null;
  source_url?: string | undefined | null;
  indexer?: string | undefined | null;
  is_seadex?: boolean | undefined | null;
  is_seadex_best?: boolean | undefined | null;
  seadex_release_group?: string | undefined | null;
  seadex_tags?: string[] | undefined | null;
  seadex_notes?: string | undefined | null;
  seadex_comparison?: string | undefined | null;
  seadex_dual_audio?: boolean | undefined | null;
}

export const DownloadSourceMetadataSchema = Schema.Struct({
  parsed_title: Schema.optional(Schema.NullishOr(Schema.String)),
  source_identity: Schema.optional(Schema.NullishOr(ParsedUnitIdentitySchema)),
  decision_reason: Schema.optional(Schema.NullishOr(Schema.String)),
  selection_kind: Schema.optional(Schema.NullishOr(DownloadSelectionKindSchema)),
  selection_score: Schema.optional(Schema.NullishOr(Schema.Number)),
  previous_quality: Schema.optional(Schema.NullishOr(Schema.String)),
  previous_score: Schema.optional(Schema.NullishOr(Schema.Number)),
  chosen_from_seadex: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  unit_title: Schema.optional(Schema.NullishOr(Schema.String)),
  air_date: Schema.optional(Schema.NullishOr(Schema.String)),
  group: Schema.optional(Schema.NullishOr(Schema.String)),
  resolution: Schema.optional(Schema.NullishOr(Schema.String)),
  quality: Schema.optional(Schema.NullishOr(Schema.String)),
  video_codec: Schema.optional(Schema.NullishOr(Schema.String)),
  audio_codec: Schema.optional(Schema.NullishOr(Schema.String)),
  audio_channels: Schema.optional(Schema.NullishOr(Schema.String)),
  trusted: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  remake: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  source_url: Schema.optional(Schema.NullishOr(Schema.String)),
  indexer: Schema.optional(Schema.NullishOr(Schema.String)),
  is_seadex: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  is_seadex_best: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  seadex_release_group: Schema.optional(Schema.NullishOr(Schema.String)),
  seadex_tags: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.String)))),
  seadex_notes: Schema.optional(Schema.NullishOr(Schema.String)),
  seadex_comparison: Schema.optional(Schema.NullishOr(Schema.String)),
  seadex_dual_audio: Schema.optional(Schema.NullishOr(Schema.Boolean)),
});
