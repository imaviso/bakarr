import { Schema } from "effect";

export class ReaderAccessError extends Schema.TaggedErrorClass<ReaderAccessError>()(
  "ReaderAccessError",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    status: Schema.Literals([400, 404, 415, 500]),
  },
) {}
