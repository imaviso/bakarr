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
  covered_units?: number[] | undefined;
  imported_path?: string | undefined;
  source_metadata?: DownloadSourceMetadata | undefined;
}

export interface DownloadEvent {
  id: DownloadEventId;
  download_id?: DownloadId | undefined;
  media_id?: MediaId | undefined;
  media_image?: string | undefined;
  media_title?: string | undefined;
  event_type: string;
  from_status?: string | undefined;
  to_status?: string | undefined;
  message: string;
  metadata?: string | undefined;
  metadata_json?: DownloadEventMetadata | undefined;
  torrent_name?: string | undefined;
  created_at: string;
}

export const DownloadEventMetadataSchema = Schema.Struct({
  covered_units: Schema.optional(Schema.mutable(Schema.Array(Schema.Number))),
  imported_path: Schema.optional(Schema.String),
  source_metadata: Schema.optional(Schema.suspend(() => DownloadSourceMetadataSchema)),
});

export const DownloadEventSchema = Schema.Struct({
  id: DownloadEventIdSchema,
  download_id: Schema.optional(DownloadIdSchema),
  media_id: Schema.optional(MediaIdSchema),
  media_image: Schema.optional(Schema.String),
  media_title: Schema.optional(Schema.String),
  event_type: Schema.String,
  from_status: Schema.optional(Schema.String),
  to_status: Schema.optional(Schema.String),
  message: Schema.String,
  metadata: Schema.optional(Schema.String),
  metadata_json: Schema.optional(DownloadEventMetadataSchema),
  torrent_name: Schema.optional(Schema.String),
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
