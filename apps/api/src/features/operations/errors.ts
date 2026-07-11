import { Schema } from "effect";

export class OperationsNotFoundError extends Schema.TaggedError<OperationsNotFoundError>()(
  "OperationsNotFoundError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class OperationsConflictError extends Schema.TaggedError<OperationsConflictError>()(
  "OperationsConflictError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class RssFeedRejectedError extends Schema.TaggedError<RssFeedRejectedError>()(
  "RssFeedRejectedError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class RssFeedParseError extends Schema.TaggedError<RssFeedParseError>()(
  "RssFeedParseError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
  },
) {}

export class RssFeedTooLargeError extends Schema.TaggedError<RssFeedTooLargeError>()(
  "RssFeedTooLargeError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}
