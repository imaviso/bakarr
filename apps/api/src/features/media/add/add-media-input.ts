import { Schema } from "effect";

import { MediaIdSchema, ReleaseProfileIdSchema } from "@/domain/domain-schema.ts";
import { MediaKindSchema } from "@packages/shared/index.ts";

const ReleaseProfileIdArraySchema = Schema.Array(ReleaseProfileIdSchema);

export class AddMediaInput extends Schema.Class<AddMediaInput>("AddMediaInput")({
  id: MediaIdSchema,
  media_kind: Schema.optional(MediaKindSchema),
  monitor_and_search: Schema.Boolean,
  monitored: Schema.Boolean,
  profile_name: Schema.String,
  release_profile_ids: ReleaseProfileIdArraySchema,
  root_folder: Schema.String,
  use_existing_root: Schema.optional(Schema.Boolean),
}) {}
