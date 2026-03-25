import { Schema } from "effect";

export class EpisodeStreamRangeError extends Schema.TaggedError<EpisodeStreamRangeError>()(
  "EpisodeStreamRangeError",
  {
    fileSize: Schema.Number,
    message: Schema.String,
    status: Schema.Literal(416),
  },
) {}
