// Shared download action wire contracts.
import { Schema } from "effect";
import { QualitySchema, type Quality } from "./profiles.ts";

export interface DownloadAction {
  Accept?:
    | {
        quality: Quality;
        is_seadex: boolean;
        is_seadex_best?: boolean | undefined;
        score: number;
      }
    | undefined;
  Upgrade?:
    | {
        quality: Quality;
        is_seadex: boolean;
        is_seadex_best?: boolean | undefined;
        score: number;
        reason: string;
        old_file_path?: string | undefined;
        old_quality: Quality;
        old_score?: number | undefined;
      }
    | undefined;
  Reject?: { reason: string } | undefined;
}

export const DownloadActionAcceptSchema = Schema.Struct({
  quality: QualitySchema,
  is_seadex: Schema.Boolean,
  is_seadex_best: Schema.optional(Schema.Boolean),
  score: Schema.Number,
});

export const DownloadActionUpgradeSchema = Schema.Struct({
  quality: QualitySchema,
  is_seadex: Schema.Boolean,
  is_seadex_best: Schema.optional(Schema.Boolean),
  score: Schema.Number,
  reason: Schema.String,
  old_file_path: Schema.optional(Schema.String),
  old_quality: QualitySchema,
  old_score: Schema.optional(Schema.Number),
});

export const DownloadActionRejectSchema = Schema.Struct({
  reason: Schema.String,
});

export const DownloadActionSchema = Schema.Struct({
  Accept: Schema.optional(DownloadActionAcceptSchema),
  Upgrade: Schema.optional(DownloadActionUpgradeSchema),
  Reject: Schema.optional(DownloadActionRejectSchema),
});
