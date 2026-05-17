import { Schema } from "effect";

export class StreamRangeError extends Schema.TaggedError<StreamRangeError>()("StreamRangeError", {
  fileSize: Schema.Number,
  message: Schema.String,
  status: Schema.Literal(416),
}) {}

export class StreamAccessError extends Schema.TaggedError<StreamAccessError>()(
  "StreamAccessError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
    status: Schema.Literal(400, 403, 404),
  },
) {}
