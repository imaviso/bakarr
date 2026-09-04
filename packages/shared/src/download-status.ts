// Shared download status (live queue) wire contracts.
import { Schema } from "effect";
import { DownloadIdSchema, type DownloadId, MediaIdSchema, type MediaId } from "./ids.ts";
import { DownloadAllowedActionSchema } from "./download.ts";
import { DownloadSourceMetadataSchema, type DownloadSourceMetadata } from "./source-metadata.ts";
import { type DownloadAllowedAction } from "./download.ts";

export interface DownloadStatus {
  media_id?: MediaId | undefined;
  media_title?: string | undefined;
  id?: DownloadId | undefined;
  unit_number?: number | undefined;
  media_image?: string | undefined;
  decision_reason?: string | undefined;
  hash: string;
  imported_path?: string | undefined;
  name: string;
  progress: number;
  speed: number;
  eta: number;
  state: string;
  total_bytes: number;
  downloaded_bytes: number;
  is_batch?: boolean | undefined;
  covered_units?: number[] | undefined;
  coverage_pending?: boolean | undefined;
  source_metadata?: DownloadSourceMetadata | undefined;
  allowed_actions?: DownloadAllowedAction[] | undefined;
}

export const DownloadStatusSchema = Schema.Struct({
  media_id: Schema.optional(MediaIdSchema),
  media_title: Schema.optional(Schema.String),
  id: Schema.optional(DownloadIdSchema),
  unit_number: Schema.optional(Schema.Number),
  media_image: Schema.optional(Schema.String),
  decision_reason: Schema.optional(Schema.String),
  hash: Schema.String,
  imported_path: Schema.optional(Schema.String),
  name: Schema.String,
  progress: Schema.Number,
  speed: Schema.Number,
  eta: Schema.Number,
  state: Schema.String,
  total_bytes: Schema.Number,
  downloaded_bytes: Schema.Number,
  is_batch: Schema.optional(Schema.Boolean),
  covered_units: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  coverage_pending: Schema.optional(Schema.Boolean),
  source_metadata: Schema.optional(Schema.suspend(() => DownloadSourceMetadataSchema)),
  allowed_actions: Schema.optional(Schema.mutable(Schema.Array(DownloadAllowedActionSchema))),
});
