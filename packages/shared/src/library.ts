// Shared library wire contracts.
import { Schema } from "effect";

import {
  LibraryRootIdSchema,
  type LibraryRootId,
  ActivityIdSchema,
  type ActivityId,
  MediaIdSchema,
  type MediaId,
} from "./ids.ts";

export interface LibraryRoot {
  id: LibraryRootId;
  label: string;
  path: string;
}
export const LibraryRootSchema = Schema.Struct({
  id: LibraryRootIdSchema,
  label: Schema.String,
  path: Schema.String,
});
export interface LibraryStats {
  total_media: number;
  monitored_media: number;
  up_to_date_media: number;
  total_units: number;
  downloaded_units: number;
  downloaded_percent: number;
  missing_units: number;
  rss_feeds: number;
  recent_downloads: number;
}
export const LibraryStatsSchema = Schema.Struct({
  total_media: Schema.Number,
  monitored_media: Schema.Number,
  up_to_date_media: Schema.Number,
  total_units: Schema.Number,
  downloaded_units: Schema.Number,
  downloaded_percent: Schema.Number,
  missing_units: Schema.Number,
  rss_feeds: Schema.Number,
  recent_downloads: Schema.Number,
});
export interface ActivityItem {
  id: ActivityId;
  activity_type: string;
  media_id: MediaId;
  media_title: string;
  unit_number?: number | undefined;
  description: string;
  timestamp: string;
}
export const ActivityItemSchema = Schema.Struct({
  id: ActivityIdSchema,
  activity_type: Schema.String,
  media_id: MediaIdSchema,
  media_title: Schema.String,
  unit_number: Schema.optional(Schema.Number),
  description: Schema.String,
  timestamp: Schema.String,
});
