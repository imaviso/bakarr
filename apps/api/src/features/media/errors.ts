import { Schema } from "effect";

export class MediaNotFoundError extends Schema.TaggedErrorClass<MediaNotFoundError>()(
  "MediaNotFoundError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}

export class MediaConflictError extends Schema.TaggedErrorClass<MediaConflictError>()(
  "MediaConflictError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}

export class AniDbRuntimeConfigError extends Schema.TaggedErrorClass<AniDbRuntimeConfigError>()(
  "AniDbRuntimeConfigError",
  { cause: Schema.Defect(), message: Schema.String },
) {}
