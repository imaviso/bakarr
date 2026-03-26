import { Schema } from "effect";

import { AnimeIdSchema, ReleaseProfileIdSchema } from "../../lib/domain-schema.ts";

const ReleaseProfileIdArraySchema = Schema.Array(ReleaseProfileIdSchema);

export class AddAnimeInput extends Schema.Class<AddAnimeInput>("AddAnimeInput")({
  id: AnimeIdSchema,
  monitor_and_search: Schema.Boolean,
  monitored: Schema.Boolean,
  profile_name: Schema.String,
  release_profile_ids: ReleaseProfileIdArraySchema,
  root_folder: Schema.String,
  use_existing_root: Schema.optional(Schema.Boolean),
}) {}
