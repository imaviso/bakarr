// Shared SSE notification event wire contracts.
import { Schema } from "effect";
import { MediaIdSchema, type MediaId } from "./ids.ts";
import { SystemStatusSchema, type SystemStatus } from "./system-status.ts";
import { DownloadStatusSchema, type DownloadStatus } from "./download-status.ts";
import { DownloadSourceMetadataSchema, type DownloadSourceMetadata } from "./source-metadata.ts";

export type NotificationEvent =
  | { type: "ScanStarted" }
  | { type: "ScanFinished" }
  | { type: "ScanProgress"; payload: { current: number; total: number } }
  | {
      type: "DownloadStarted";
      payload: {
        title: string;
        media_id?: MediaId | undefined | null;
        source_metadata?: DownloadSourceMetadata | undefined | null;
      };
    }
  | {
      type: "DownloadFinished";
      payload: {
        title: string;
        media_id?: MediaId | undefined | null;
        imported_path?: string | undefined | null;
        source_metadata?: DownloadSourceMetadata | undefined | null;
      };
    }
  | { type: "RefreshStarted"; payload: { media_id: MediaId; title: string } }
  | { type: "RefreshFinished"; payload: { media_id: MediaId; title: string } }
  | {
      type: "SearchMissingStarted";
      payload: { media_id?: MediaId | null | undefined; title: string };
    }
  | {
      type: "SearchMissingFinished";
      payload: { media_id?: MediaId | null | undefined; title: string; count: number };
    }
  | { type: "ScanFolderStarted"; payload: { media_id: MediaId; title: string } }
  | {
      type: "ScanFolderFinished";
      payload: { media_id: MediaId; title: string; found: number };
    }
  | { type: "RenameStarted"; payload: { media_id: MediaId; title: string } }
  | {
      type: "RenameFinished";
      payload: { media_id: MediaId; title: string; count: number };
    }
  | { type: "ImportStarted"; payload: { count: number } }
  | {
      type: "ImportFinished";
      payload: { count: number; imported: number; failed: number };
    }
  | { type: "LibraryScanStarted" }
  | {
      type: "LibraryScanFinished";
      payload: { scanned: number; matched: number; updated?: number | null | undefined };
    }
  | { type: "LibraryScanProgress"; payload: { scanned: number } }
  | { type: "RssCheckStarted" }
  | {
      type: "RssCheckFinished";
      payload: { total_feeds?: number | null | undefined; new_items: number };
    }
  | {
      type: "RssCheckProgress";
      payload: { current: number; total: number; feed_name: string };
    }
  | { type: "PasswordChanged" }
  | { type: "ApiKeyRegenerated" }
  | { type: "Error"; payload: { message: string } }
  | { type: "Info"; payload: { message: string } }
  | { type: "DownloadProgress"; payload: { downloads: DownloadStatus[] } }
  | { type: "SystemStatus"; payload: SystemStatus };

export const NotificationEventSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ScanStarted") }),
  Schema.Struct({ type: Schema.Literal("ScanFinished") }),
  Schema.Struct({
    type: Schema.Literal("ScanProgress"),
    payload: Schema.Struct({
      current: Schema.Number,
      total: Schema.Number,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("DownloadStarted"),
    payload: Schema.Struct({
      title: Schema.String,
      media_id: Schema.optional(Schema.NullishOr(MediaIdSchema)),
      source_metadata: Schema.optional(
        Schema.NullishOr(Schema.suspend(() => DownloadSourceMetadataSchema)),
      ),
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("DownloadFinished"),
    payload: Schema.Struct({
      title: Schema.String,
      media_id: Schema.optional(Schema.NullishOr(MediaIdSchema)),
      imported_path: Schema.optional(Schema.NullishOr(Schema.String)),
      source_metadata: Schema.optional(
        Schema.NullishOr(Schema.suspend(() => DownloadSourceMetadataSchema)),
      ),
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("RefreshStarted"),
    payload: Schema.Struct({
      media_id: MediaIdSchema,
      title: Schema.String,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("RefreshFinished"),
    payload: Schema.Struct({
      media_id: MediaIdSchema,
      title: Schema.String,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("SearchMissingStarted"),
    payload: Schema.Struct({
      media_id: Schema.optional(Schema.NullishOr(MediaIdSchema)),
      title: Schema.String,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("SearchMissingFinished"),
    payload: Schema.Struct({
      media_id: Schema.optional(Schema.NullishOr(MediaIdSchema)),
      title: Schema.String,
      count: Schema.Number,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("ScanFolderStarted"),
    payload: Schema.Struct({
      media_id: MediaIdSchema,
      title: Schema.String,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("ScanFolderFinished"),
    payload: Schema.Struct({
      media_id: MediaIdSchema,
      title: Schema.String,
      found: Schema.Number,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("RenameStarted"),
    payload: Schema.Struct({
      media_id: MediaIdSchema,
      title: Schema.String,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("RenameFinished"),
    payload: Schema.Struct({
      media_id: MediaIdSchema,
      title: Schema.String,
      count: Schema.Number,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("ImportStarted"),
    payload: Schema.Struct({ count: Schema.Number }),
  }),
  Schema.Struct({
    type: Schema.Literal("ImportFinished"),
    payload: Schema.Struct({
      count: Schema.Number,
      imported: Schema.Number,
      failed: Schema.Number,
    }),
  }),
  Schema.Struct({ type: Schema.Literal("LibraryScanStarted") }),
  Schema.Struct({
    type: Schema.Literal("LibraryScanFinished"),
    payload: Schema.Struct({
      scanned: Schema.Number,
      matched: Schema.Number,
      updated: Schema.optional(Schema.NullishOr(Schema.Number)),
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("LibraryScanProgress"),
    payload: Schema.Struct({ scanned: Schema.Number }),
  }),
  Schema.Struct({ type: Schema.Literal("RssCheckStarted") }),
  Schema.Struct({
    type: Schema.Literal("RssCheckFinished"),
    payload: Schema.Struct({
      total_feeds: Schema.optional(Schema.NullishOr(Schema.Number)),
      new_items: Schema.Number,
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("RssCheckProgress"),
    payload: Schema.Struct({
      current: Schema.Number,
      total: Schema.Number,
      feed_name: Schema.String,
    }),
  }),
  Schema.Struct({ type: Schema.Literal("PasswordChanged") }),
  Schema.Struct({ type: Schema.Literal("ApiKeyRegenerated") }),
  Schema.Struct({
    type: Schema.Literal("Error"),
    payload: Schema.Struct({ message: Schema.String }),
  }),
  Schema.Struct({
    type: Schema.Literal("Info"),
    payload: Schema.Struct({ message: Schema.String }),
  }),
  Schema.Struct({
    type: Schema.Literal("DownloadProgress"),
    payload: Schema.Struct({
      downloads: Schema.mutable(Schema.Array(DownloadStatusSchema)),
    }),
  }),
  Schema.Struct({
    type: Schema.Literal("SystemStatus"),
    payload: SystemStatusSchema,
  }),
]);

export const NotificationEventWireSchema = Schema.fromJsonString(NotificationEventSchema);

export const decodeNotificationEventWire = Schema.decodeUnknownResult(NotificationEventWireSchema);

export const encodeNotificationEventWire = Schema.encodeEffect(NotificationEventWireSchema);
