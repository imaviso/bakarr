// Shared download status (live queue) wire contracts.
import { Schema } from "effect";
import { DownloadIdSchema, type DownloadId, MediaIdSchema, type MediaId } from "./ids.ts";
import { DownloadAllowedActionSchema } from "./download.ts";
import { DownloadSourceMetadataSchema, type DownloadSourceMetadata } from "./source-metadata.ts";
import { type DownloadAllowedAction } from "./download.ts";

export interface DownloadStatus {
  media_id?: MediaId | undefined | null;
  media_title?: string | undefined | null;
  id?: DownloadId | undefined | null;
  unit_number?: number | undefined | null;
  media_image?: string | undefined | null;
  decision_reason?: string | undefined | null;
  hash: string;
  imported_path?: string | undefined | null;
  name: string;
  progress: number;
  speed: number;
  eta: number;
  state: string;
  total_bytes: number;
  downloaded_bytes: number;
  is_batch?: boolean | undefined | null;
  covered_units?: number[] | undefined | null;
  coverage_pending?: boolean | undefined | null;
  source_metadata?: DownloadSourceMetadata | undefined | null;
  allowed_actions?: DownloadAllowedAction[] | undefined | null;
}

export const DownloadStatusSchema = Schema.Struct({
  media_id: Schema.optional(Schema.NullishOr(MediaIdSchema)),
  media_title: Schema.optional(Schema.NullishOr(Schema.String)),
  id: Schema.optional(Schema.NullishOr(DownloadIdSchema)),
  unit_number: Schema.optional(Schema.NullishOr(Schema.Number)),
  media_image: Schema.optional(Schema.NullishOr(Schema.String)),
  decision_reason: Schema.optional(Schema.NullishOr(Schema.String)),
  hash: Schema.String,
  imported_path: Schema.optional(Schema.NullishOr(Schema.String)),
  name: Schema.String,
  progress: Schema.Number,
  speed: Schema.Number,
  eta: Schema.Number,
  state: Schema.String,
  total_bytes: Schema.Number,
  downloaded_bytes: Schema.Number,
  is_batch: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  covered_units: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.Number)))),
  coverage_pending: Schema.optional(Schema.NullishOr(Schema.Boolean)),
  source_metadata: Schema.optional(
    Schema.NullishOr(Schema.suspend(() => DownloadSourceMetadataSchema)),
  ),
  allowed_actions: Schema.optional(
    Schema.NullishOr(Schema.mutable(Schema.Array(DownloadAllowedActionSchema))),
  ),
});
