import { Schema } from "effect";

import {
  DomainConflictError,
  DomainInputError,
  DomainNotFoundError,
  DomainPathError,
  InfrastructureError,
  StoredDataError,
} from "@/features/errors.ts";
import { MediaConflictError, MediaNotFoundError } from "@/features/media/errors.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";

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
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class RssFeedTooLargeError extends Schema.TaggedError<RssFeedTooLargeError>()(
  "RssFeedTooLargeError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export type OperationsError =
  | OperationsNotFoundError
  | OperationsConflictError
  | MediaNotFoundError
  | MediaConflictError
  | DomainNotFoundError
  | DomainConflictError
  | DomainInputError
  | DomainPathError
  | StoredDataError
  | InfrastructureError
  | RssFeedParseError
  | RssFeedRejectedError
  | RssFeedTooLargeError
  | ExternalCallError;

export function isOperationsError(cause: unknown): cause is OperationsError {
  return (
    cause instanceof DomainNotFoundError ||
    cause instanceof DomainConflictError ||
    cause instanceof OperationsNotFoundError ||
    cause instanceof OperationsConflictError ||
    cause instanceof DomainInputError ||
    cause instanceof DomainPathError ||
    cause instanceof MediaNotFoundError ||
    cause instanceof MediaConflictError ||
    cause instanceof StoredDataError ||
    cause instanceof InfrastructureError ||
    cause instanceof RssFeedParseError ||
    cause instanceof RssFeedRejectedError ||
    cause instanceof RssFeedTooLargeError ||
    cause instanceof ExternalCallError
  );
}
