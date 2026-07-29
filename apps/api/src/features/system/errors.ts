import { Schema, SchemaIssue } from "effect";

import { DomainNotFoundError } from "@/features/errors.ts";
import { DiskSpaceError } from "@/features/system/disk-space.ts";

export class SystemNotFoundError extends Schema.TaggedErrorClass<SystemNotFoundError>()(
  "SystemNotFoundError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}

export class SystemConflictError extends Schema.TaggedErrorClass<SystemConflictError>()(
  "SystemConflictError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}

export class ConfigValidationError extends Schema.TaggedErrorClass<ConfigValidationError>()(
  "ConfigValidationError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}

export class StoredConfigCorruptError extends Schema.TaggedErrorClass<StoredConfigCorruptError>()(
  "StoredConfigCorruptError",
  { cause: Schema.Defect(), message: Schema.String },
) {}

export class StoredConfigMissingError extends Schema.TaggedErrorClass<StoredConfigMissingError>()(
  "StoredConfigMissingError",
  { message: Schema.String },
) {}

export function makeStoredConfigCorruptError(message: string, cause: unknown) {
  const detail =
    cause && Schema.isSchemaError(cause)
      ? SchemaIssue.makeFormatterDefault()(cause.issue)
      : undefined;

  return new StoredConfigCorruptError({
    cause,
    message: detail ? `${message}: ${detail}` : message,
  });
}

export class ImageAssetNotFoundError extends Schema.TaggedErrorClass<ImageAssetNotFoundError>()(
  "ImageAssetNotFoundError",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    status: Schema.Literal(404),
  },
) {}

export class ImageAssetTooLargeError extends Schema.TaggedErrorClass<ImageAssetTooLargeError>()(
  "ImageAssetTooLargeError",
  {
    message: Schema.String,
    status: Schema.Literal(413),
  },
) {}

export class ImageAssetAccessError extends Schema.TaggedErrorClass<ImageAssetAccessError>()(
  "ImageAssetAccessError",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    status: Schema.Literal(500),
  },
) {}

export class StoredUnmappedFolderCorruptError extends Schema.TaggedErrorClass<StoredUnmappedFolderCorruptError>()(
  "StoredUnmappedFolderCorruptError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}

export type StoredConfigReadError = StoredConfigCorruptError | StoredConfigMissingError;

export const isStoredConfigReadError = Schema.is(
  Schema.Union([StoredConfigCorruptError, StoredConfigMissingError]),
);

export type SystemConfigServiceError =
  | ConfigValidationError
  | DiskSpaceError
  | StoredConfigReadError
  | SystemNotFoundError
  | SystemConflictError
  | DomainNotFoundError;
