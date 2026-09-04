// Shared download wire contracts.
import { Schema, Struct } from "effect";
import { DownloadIdSchema, type DownloadId, MediaIdSchema, type MediaId } from "./ids.ts";
import { DownloadSourceMetadataSchema, type DownloadSourceMetadata } from "./source-metadata.ts";

export interface Download {
  id: DownloadId;
  media_id: MediaId;
  media_title: string;
  media_image?: string | undefined | null;
  unit_number: number;
  torrent_name: string;
  is_batch?: boolean | undefined | null;
  covered_units?: number[] | undefined | null;
  coverage_pending?: boolean | undefined | null;
  decision_reason?: string | undefined | null;
  imported_path?: string | undefined | null;
  status?: string | undefined | null;
  progress?: number | undefined | null;
  added_at?: string | undefined | null;
  download_date?: string | undefined | null;
  group_name?: string | undefined | null;
  external_state?: string | undefined | null;
  error_message?: string | undefined | null;
  save_path?: string | undefined | null;
  content_path?: string | undefined | null;
  total_bytes?: number | undefined | null;
  downloaded_bytes?: number | undefined | null;
  speed_bytes?: number | undefined | null;
  eta_seconds?: number | undefined | null;
  last_synced_at?: string | undefined | null;
  retry_count?: number | undefined | null;
  last_error_at?: string | undefined | null;
  reconciled_at?: string | undefined | null;
  source_metadata?: DownloadSourceMetadata | undefined | null;
  allowed_actions?: DownloadAllowedAction[] | undefined | null;
}

export const DOWNLOAD_ALLOWED_ACTION_VALUES = [
  "pause",
  "resume",
  "retry",
  "reconcile",
  "delete",
] as const;

export type DownloadAllowedAction = (typeof DOWNLOAD_ALLOWED_ACTION_VALUES)[number];

export const DownloadAllowedActionSchema = Schema.Literals([...DOWNLOAD_ALLOWED_ACTION_VALUES]);

export const DownloadSchema = Schema.Struct({
  id: DownloadIdSchema,
  media_id: MediaIdSchema,
  media_title: Schema.String,
  media_image: Schema.optional(Schema.NullishOr(Schema.String)),
  unit_number: Schema.Number,
  torrent_name: Schema.String,
  is_batch: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  covered_units: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.Number)))),
  coverage_pending: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  decision_reason: Schema.optional(Schema.NullishOr(Schema.String)),
  imported_path: Schema.optional(Schema.NullishOr(Schema.String)),
  status: Schema.optional(Schema.NullishOr(Schema.String)),
  progress: Schema.optional(Schema.NullishOr(Schema.Number)),
  added_at: Schema.optional(Schema.NullishOr(Schema.String)),
  download_date: Schema.optional(Schema.NullishOr(Schema.String)),
  group_name: Schema.optional(Schema.NullishOr(Schema.String)),
  external_state: Schema.optional(Schema.NullishOr(Schema.String)),
  error_message: Schema.optional(Schema.NullishOr(Schema.String)),
  save_path: Schema.optional(Schema.NullishOr(Schema.String)),
  content_path: Schema.optional(Schema.NullishOr(Schema.String)),
  total_bytes: Schema.optional(Schema.NullishOr(Schema.Number)),
  downloaded_bytes: Schema.optional(Schema.NullishOr(Schema.Number)),
  speed_bytes: Schema.optional(Schema.NullishOr(Schema.Number)),
  eta_seconds: Schema.optional(Schema.NullishOr(Schema.Number)),
  last_synced_at: Schema.optional(Schema.NullishOr(Schema.String)),
  retry_count: Schema.optional(Schema.NullishOr(Schema.Number)),
  last_error_at: Schema.optional(Schema.NullishOr(Schema.String)),
  reconciled_at: Schema.optional(Schema.NullishOr(Schema.String)),
  source_metadata: Schema.optional(
    Schema.NullishOr(Schema.suspend(() => DownloadSourceMetadataSchema)),
  ),
  allowed_actions: Schema.optional(
    Schema.NullishOr(Schema.mutable(Schema.Array(DownloadAllowedActionSchema))),
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export interface DownloadHistoryPage {
  downloads: Download[];
  limit: number;
  total: number;
  has_more: boolean;
  next_cursor?: string | null | undefined;
}

export const DownloadHistoryPageSchema = Schema.Struct({
  downloads: Schema.mutable(Schema.Array(DownloadSchema)),
  limit: Schema.Number,
  total: Schema.Number,
  has_more: Schema.Boolean,
  next_cursor: Schema.optional(Schema.NullishOr(Schema.String)),
});
