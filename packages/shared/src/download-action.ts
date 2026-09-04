// Shared download action wire contracts.
import { Schema } from "effect";
import { QualitySchema, type Quality } from "./profiles.ts";

export interface DownloadAction {
  Accept?:
    | {
        quality: Quality;
        is_seadex: boolean;
        is_seadex_best?: boolean | null | undefined;
        score: number;
      }
    | null
    | undefined;
  Upgrade?:
    | {
        quality: Quality;
        is_seadex: boolean;
        is_seadex_best?: boolean | null | undefined;
        score: number;
        reason: string;
        old_file_path?: string | null | undefined;
        old_quality: Quality;
        old_score?: number | null | undefined;
      }
    | null
    | undefined;
  Reject?: { reason: string } | null | undefined;
}

export const DownloadActionAcceptSchema = Schema.Struct({
  quality: QualitySchema,
  is_seadex: Schema.Boolean,
  is_seadex_best: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  score: Schema.Number,
});

export const DownloadActionUpgradeSchema = Schema.Struct({
  quality: QualitySchema,
  is_seadex: Schema.Boolean,
  is_seadex_best: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  score: Schema.Number,
  reason: Schema.String,
  old_file_path: Schema.optional(Schema.NullishOr(Schema.String)),
  old_quality: QualitySchema,
  old_score: Schema.optional(Schema.NullishOr(Schema.Number)),
});

export const DownloadActionRejectSchema = Schema.Struct({
  reason: Schema.String,
});

export const DownloadActionSchema = Schema.Struct({
  Accept: Schema.optional(Schema.NullishOr(DownloadActionAcceptSchema)),
  Upgrade: Schema.optional(Schema.NullishOr(DownloadActionUpgradeSchema)),
  Reject: Schema.optional(Schema.NullishOr(DownloadActionRejectSchema)),
});
