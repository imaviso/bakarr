import { Schema } from "effect";

export class MediaNotFoundError extends Schema.TaggedError<MediaNotFoundError>()(
  "MediaNotFoundError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class MediaConflictError extends Schema.TaggedError<MediaConflictError>()(
  "MediaConflictError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class AniDbRuntimeConfigError extends Schema.TaggedError<AniDbRuntimeConfigError>()(
  "AniDbRuntimeConfigError",
  { cause: Schema.Defect, message: Schema.String },
) {}
