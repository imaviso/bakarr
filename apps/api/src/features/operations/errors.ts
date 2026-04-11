import { Schema } from "effect";

import { ExternalCallError } from "@/lib/effect-retry.ts";

export class DownloadNotFoundError extends Schema.TaggedError<DownloadNotFoundError>()(
  "DownloadNotFoundError",
  { message: Schema.String },
) {}

export class OperationsAnimeNotFoundError extends Schema.TaggedError<OperationsAnimeNotFoundError>()(
  "OperationsAnimeNotFoundError",
  { message: Schema.String },
) {}

export class DownloadConflictError extends Schema.TaggedError<DownloadConflictError>()(
  "DownloadConflictError",
  { message: Schema.String },
) {}

export class OperationsInputError extends Schema.TaggedError<OperationsInputError>()(
  "OperationsInputError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class OperationsConflictError extends Schema.TaggedError<OperationsConflictError>()(
  "OperationsConflictError",
  { message: Schema.String },
) {}

export class OperationsPathError extends Schema.TaggedError<OperationsPathError>()(
  "OperationsPathError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class RssFeedRejectedError extends Schema.TaggedError<RssFeedRejectedError>()(
  "RssFeedRejectedError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class RssFeedParseError extends Schema.TaggedError<RssFeedParseError>()(
  "RssFeedParseError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class RssFeedTooLargeError extends Schema.TaggedError<RssFeedTooLargeError>()(
  "RssFeedTooLargeError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class OperationsStoredDataError extends Schema.TaggedError<OperationsStoredDataError>()(
  "OperationsStoredDataError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class OperationsInfrastructureError extends Schema.TaggedError<OperationsInfrastructureError>()(
  "OperationsInfrastructureError",
  { message: Schema.String, cause: Schema.optional(Schema.Defect) },
) {}

export type OperationsError =
  | DownloadNotFoundError
  | DownloadConflictError
  | OperationsConflictError
  | OperationsAnimeNotFoundError
  | OperationsInputError
  | OperationsPathError
  | OperationsStoredDataError
  | OperationsInfrastructureError
  | RssFeedParseError
  | RssFeedRejectedError
  | RssFeedTooLargeError
  | ExternalCallError;

export function isOperationsError(cause: unknown): cause is OperationsError {
  return (
    cause instanceof DownloadNotFoundError ||
    cause instanceof DownloadConflictError ||
    cause instanceof OperationsConflictError ||
    cause instanceof OperationsAnimeNotFoundError ||
    cause instanceof OperationsInputError ||
    cause instanceof OperationsPathError ||
    cause instanceof OperationsStoredDataError ||
    cause instanceof OperationsInfrastructureError ||
    cause instanceof RssFeedParseError ||
    cause instanceof RssFeedRejectedError ||
    cause instanceof RssFeedTooLargeError ||
    cause instanceof ExternalCallError
  );
}
