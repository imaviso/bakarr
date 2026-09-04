// Shared library browse wire contracts.
import { Schema } from "effect";

export interface BrowseEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size?: number | undefined;
}

export const BrowseEntrySchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  is_directory: Schema.Boolean,
  size: Schema.optional(Schema.Number),
});

export interface BrowseResult {
  current_path: string;
  parent_path?: string | undefined;
  entries: BrowseEntry[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export const BrowseResultSchema = Schema.Struct({
  current_path: Schema.String,
  parent_path: Schema.optional(Schema.String),
  entries: Schema.mutable(Schema.Array(BrowseEntrySchema)),
  total: Schema.Number,
  limit: Schema.Number,
  offset: Schema.Number,
  has_more: Schema.Boolean,
});
