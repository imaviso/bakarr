import { Schema } from "effect";

export class OperationsNotFoundError extends Schema.TaggedErrorClass<OperationsNotFoundError>()(
  "OperationsNotFoundError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}

export class OperationsConflictError extends Schema.TaggedErrorClass<OperationsConflictError>()(
  "OperationsConflictError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}

export class RssFeedRejectedError extends Schema.TaggedErrorClass<RssFeedRejectedError>()(
  "RssFeedRejectedError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}

export class RssFeedParseError extends Schema.TaggedErrorClass<RssFeedParseError>()(
  "RssFeedParseError",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
  },
) {}

export class RssFeedTooLargeError extends Schema.TaggedErrorClass<RssFeedTooLargeError>()(
  "RssFeedTooLargeError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}
