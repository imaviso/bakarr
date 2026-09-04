// Shared download event wire contracts.
import { Schema } from "effect";
import {
  DownloadEventIdSchema,
  type DownloadEventId,
  DownloadIdSchema,
  type DownloadId,
  MediaIdSchema,
  type MediaId,
} from "./ids.ts";
import { DownloadSourceMetadataSchema, type DownloadSourceMetadata } from "./source-metadata.ts";

export interface DownloadEventMetadata {
  covered_units?: number[] | undefined | null;
  imported_path?: string | undefined | null;
  source_metadata?: DownloadSourceMetadata | undefined | null;
}

export interface DownloadEvent {
  id: DownloadEventId;
  download_id?: DownloadId | undefined | null;
  media_id?: MediaId | undefined | null;
  media_image?: string | undefined | null;
  media_title?: string | undefined | null;
  event_type: string;
  from_status?: string | undefined | null;
  to_status?: string | undefined | null;
  message: string;
  metadata?: string | undefined | null;
  metadata_json?: DownloadEventMetadata | undefined | null;
  torrent_name?: string | undefined | null;
  created_at: string;
}

export const DownloadEventMetadataSchema = Schema.Struct({
  covered_units: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.Number)))),
  imported_path: Schema.optional(Schema.NullishOr(Schema.String)),
  source_metadata: Schema.optional(
    Schema.NullishOr(Schema.suspend(() => DownloadSourceMetadataSchema)),
  ),
});

export const DownloadEventSchema = Schema.Struct({
  id: DownloadEventIdSchema,
  download_id: Schema.optional(Schema.NullishOr(DownloadIdSchema)),
  media_id: Schema.optional(Schema.NullishOr(MediaIdSchema)),
  media_image: Schema.optional(Schema.NullishOr(Schema.String)),
  media_title: Schema.optional(Schema.NullishOr(Schema.String)),
  event_type: Schema.String,
  from_status: Schema.optional(Schema.NullishOr(Schema.String)),
  to_status: Schema.optional(Schema.NullishOr(Schema.String)),
  message: Schema.String,
  metadata: Schema.optional(Schema.NullishOr(Schema.String)),
  metadata_json: Schema.optional(Schema.NullishOr(DownloadEventMetadataSchema)),
  torrent_name: Schema.optional(Schema.NullishOr(Schema.String)),
  created_at: Schema.String,
});

export interface DownloadEventsPage {
  events: DownloadEvent[];
  limit: number;
  total: number;
  has_more: boolean;
  next_cursor?: string | null | undefined;
  prev_cursor?: string | null | undefined;
}

export const DownloadEventsPageSchema = Schema.Struct({
  events: Schema.mutable(Schema.Array(DownloadEventSchema)),
  limit: Schema.Number,
  total: Schema.Number,
  has_more: Schema.Boolean,
  next_cursor: Schema.optional(Schema.NullishOr(Schema.String)),
  prev_cursor: Schema.optional(Schema.NullishOr(Schema.String)),
});

export type DownloadEventsExportOrder = "asc" | "desc";

export const DownloadEventsExportOrderSchema = Schema.Literals(["asc", "desc"]);

export interface DownloadEventsExport {
  events: DownloadEvent[];
  total: number;
  exported: number;
  truncated: boolean;
  limit: number;
  order: DownloadEventsExportOrder;
  generated_at: string;
}

export const DownloadEventsExportSchema = Schema.Struct({
  events: Schema.mutable(Schema.Array(DownloadEventSchema)),
  total: Schema.Number,
  exported: Schema.Number,
  truncated: Schema.Boolean,
  limit: Schema.Number,
  order: DownloadEventsExportOrderSchema,
  generated_at: Schema.String,
});
