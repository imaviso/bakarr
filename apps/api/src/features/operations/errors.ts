import { Schema } from "effect";

import {
  DomainConflictError,
  DomainInputError,
  DomainNotFoundError,
  DomainPathError,
  InfrastructureError,
  StoredDataError,
} from "@/features/errors.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";

export { DomainConflictError as DownloadConflictError } from "@/features/errors.ts";
export { DomainConflictError as OperationsConflictError } from "@/features/errors.ts";
export { DomainInputError as OperationsInputError } from "@/features/errors.ts";
export { DomainNotFoundError as DownloadNotFoundError } from "@/features/errors.ts";
export { DomainNotFoundError as OperationsAnimeNotFoundError } from "@/features/errors.ts";
export { DomainNotFoundError as OperationsTaskNotFoundError } from "@/features/errors.ts";
export { DomainPathError as OperationsPathError } from "@/features/errors.ts";

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

export { InfrastructureError as OperationsInfrastructureError } from "@/features/errors.ts";
export { StoredDataError as OperationsStoredDataError } from "@/features/errors.ts";

export type OperationsError =
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
    cause instanceof DomainInputError ||
    cause instanceof DomainPathError ||
    cause instanceof StoredDataError ||
    cause instanceof InfrastructureError ||
    cause instanceof RssFeedParseError ||
    cause instanceof RssFeedRejectedError ||
    cause instanceof RssFeedTooLargeError ||
    cause instanceof ExternalCallError
  );
}
