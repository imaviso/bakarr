// Shared download wire contracts.
import { Schema, Struct } from "effect";
import { DownloadIdSchema, type DownloadId, MediaIdSchema, type MediaId } from "./ids.ts";
import { DownloadSourceMetadataSchema, type DownloadSourceMetadata } from "./source-metadata.ts";

export interface Download {
  id: DownloadId;
  media_id: MediaId;
  media_title: string;
  media_image?: string | undefined;
  unit_number: number;
  torrent_name: string;
  is_batch?: boolean | undefined;
  covered_units?: number[] | undefined;
  coverage_pending?: boolean | undefined;
  decision_reason?: string | undefined;
  imported_path?: string | undefined;
  status?: string | undefined;
  progress?: number | undefined;
  added_at?: string | undefined;
  download_date?: string | undefined;
  group_name?: string | undefined;
  external_state?: string | undefined;
  error_message?: string | undefined;
  save_path?: string | undefined;
  content_path?: string | undefined;
  total_bytes?: number | undefined;
  downloaded_bytes?: number | undefined;
  speed_bytes?: number | undefined;
  eta_seconds?: number | undefined;
  last_synced_at?: string | undefined;
  retry_count?: number | undefined;
  last_error_at?: string | undefined;
  reconciled_at?: string | undefined;
  source_metadata?: DownloadSourceMetadata | undefined;
  allowed_actions?: DownloadAllowedAction[] | undefined;
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
  media_image: Schema.optional(Schema.String),
  unit_number: Schema.Number,
  torrent_name: Schema.String,
  is_batch: Schema.optional(Schema.Boolean),
  covered_units: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  coverage_pending: Schema.optional(Schema.Boolean),
  decision_reason: Schema.optional(Schema.String),
  imported_path: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  progress: Schema.optional(Schema.Number),
  added_at: Schema.optional(Schema.String),
  download_date: Schema.optional(Schema.String),
  group_name: Schema.optional(Schema.String),
  external_state: Schema.optional(Schema.String),
  error_message: Schema.optional(Schema.String),
  save_path: Schema.optional(Schema.String),
  content_path: Schema.optional(Schema.String),
  total_bytes: Schema.optional(Schema.Number),
  downloaded_bytes: Schema.optional(Schema.Number),
  speed_bytes: Schema.optional(Schema.Number),
  eta_seconds: Schema.optional(Schema.Number),
  last_synced_at: Schema.optional(Schema.String),
  retry_count: Schema.optional(Schema.Number),
  last_error_at: Schema.optional(Schema.String),
  reconciled_at: Schema.optional(Schema.String),
  source_metadata: Schema.optional(Schema.suspend(() => DownloadSourceMetadataSchema)),
  allowed_actions: Schema.optional(Schema.mutable(Schema.Array(DownloadAllowedActionSchema))),
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
