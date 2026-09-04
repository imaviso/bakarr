// Shared file unit mapping wire contracts.
import { Schema } from "effect";

import { MediaIdSchema, type MediaId } from "./ids.ts";

export interface FileUnitMapping {
  media_id: MediaId;
  media_title: string;
  unit_numbers?: number[] | undefined | null;
  file_path?: string | undefined | null;
}

export const FileUnitMappingSchema = Schema.Struct({
  media_id: MediaIdSchema,
  media_title: Schema.String,
  unit_numbers: Schema.optional(Schema.NullishOr(Schema.mutable(Schema.Array(Schema.Number)))),
  file_path: Schema.optional(Schema.NullishOr(Schema.String)),
});
