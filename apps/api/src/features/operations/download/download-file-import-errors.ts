import { Schema } from "effect";

export class ImportFileError extends Schema.TaggedError<ImportFileError>()("ImportFileError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}
