import { Schema } from "effect";

export class EpisodeStreamRangeError extends Schema.TaggedError<EpisodeStreamRangeError>()(
  "EpisodeStreamRangeError",
  {
    fileSize: Schema.Number,
    message: Schema.String,
    status: Schema.Literal(416),
  },
) {}

export class EpisodeStreamAccessError extends Schema.TaggedError<EpisodeStreamAccessError>()(
  "EpisodeStreamAccessError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
    status: Schema.Literal(400, 403, 404),
  },
) {}
