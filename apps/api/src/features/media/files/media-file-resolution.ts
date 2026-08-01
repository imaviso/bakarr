import { Schema } from "effect";

export class UnitFileResolved extends Schema.TaggedClass<UnitFileResolved>()("UnitFileResolved", {
  fileName: Schema.String,
  filePath: Schema.String,
}) {}

export class UnitFileResolveError extends Schema.TaggedError<UnitFileResolveError>()(
  "UnitFileResolveError",
  {
    filePath: Schema.optional(Schema.String),
    mediaId: Schema.Number,
    message: Schema.String,
    reason: Schema.Literal("unmapped", "missing", "root-inaccessible", "outside-root"),
    rootFolder: Schema.optional(Schema.String),
    unitNumber: Schema.Number,
  },
) {}
