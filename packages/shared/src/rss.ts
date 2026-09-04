// Shared RSS feed wire contracts.
import { Schema } from "effect";
import { MediaIdSchema, type MediaId, RssFeedIdSchema, type RssFeedId } from "./ids.ts";

export interface RssFeed {
  id: RssFeedId;
  media_id: MediaId;
  url: string;
  name?: string | undefined;
  last_checked?: string | undefined;
  enabled: boolean;
  created_at: string;
}

export const RssFeedSchema = Schema.Struct({
  id: RssFeedIdSchema,
  media_id: MediaIdSchema,
  url: Schema.String,
  name: Schema.optional(Schema.String),
  last_checked: Schema.optional(Schema.String),
  enabled: Schema.Boolean,
  created_at: Schema.String,
});
