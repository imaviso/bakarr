import { Schema } from "effect";

export class SystemServiceError extends Schema.TaggedError<SystemServiceError>()(
  "SystemServiceError",
  {
    message: Schema.String,
    status: Schema.Literal(400, 404, 409),
  },
) {}
