import { ParseResult, Schema } from "effect";

import { DomainNotFoundError } from "@/features/errors.ts";
import { DiskSpaceError } from "@/features/system/disk-space.ts";

export class SystemNotFoundError extends Schema.TaggedError<SystemNotFoundError>()(
  "SystemNotFoundError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class SystemConflictError extends Schema.TaggedError<SystemConflictError>()(
  "SystemConflictError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class ConfigValidationError extends Schema.TaggedError<ConfigValidationError>()(
  "ConfigValidationError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class StoredConfigCorruptError extends Schema.TaggedError<StoredConfigCorruptError>()(
  "StoredConfigCorruptError",
  { cause: Schema.Defect, message: Schema.String },
) {}

export class StoredConfigMissingError extends Schema.TaggedError<StoredConfigMissingError>()(
  "StoredConfigMissingError",
  { message: Schema.String },
) {}

export function makeStoredConfigCorruptError(message: string, cause: unknown) {
  const detail =
    cause && ParseResult.isParseError(cause)
      ? ParseResult.TreeFormatter.formatErrorSync(cause)
      : undefined;

  return new StoredConfigCorruptError({
    cause,
    message: detail ? `${message}: ${detail}` : message,
  });
}

export class ImageAssetNotFoundError extends Schema.TaggedError<ImageAssetNotFoundError>()(
  "ImageAssetNotFoundError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
    status: Schema.Literal(404),
  },
) {}

export class ImageAssetTooLargeError extends Schema.TaggedError<ImageAssetTooLargeError>()(
  "ImageAssetTooLargeError",
  {
    message: Schema.String,
    status: Schema.Literal(413),
  },
) {}

export class ImageAssetAccessError extends Schema.TaggedError<ImageAssetAccessError>()(
  "ImageAssetAccessError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
    status: Schema.Literal(500),
  },
) {}

export class StoredUnmappedFolderCorruptError extends Schema.TaggedError<StoredUnmappedFolderCorruptError>()(
  "StoredUnmappedFolderCorruptError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export type StoredConfigReadError = StoredConfigCorruptError | StoredConfigMissingError;

export const isStoredConfigReadError = Schema.is(
  Schema.Union(StoredConfigCorruptError, StoredConfigMissingError),
);

export type SystemConfigServiceError =
  | ConfigValidationError
  | DiskSpaceError
  | StoredConfigReadError
  | SystemNotFoundError
  | SystemConflictError
  | DomainNotFoundError;
