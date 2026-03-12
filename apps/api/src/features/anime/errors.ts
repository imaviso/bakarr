import { Schema } from "effect";

export class AnimeServiceError extends Schema.TaggedError<AnimeServiceError>()(
  "AnimeServiceError",
  {
    message: Schema.String,
    status: Schema.Literal(400, 404, 409),
  },
) {}
