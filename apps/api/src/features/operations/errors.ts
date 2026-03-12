import { Schema } from "effect";

export class OperationsError extends Schema.TaggedError<OperationsError>()(
  "OperationsError",
  {
    message: Schema.String,
    status: Schema.Literal(400, 404, 409),
  },
) {}
