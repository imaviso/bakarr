import { Schema } from "effect";

import { DiskSpaceError } from "@/features/system/disk-space.ts";

export class ConfigValidationError extends Schema.TaggedError<ConfigValidationError>()(
  "ConfigValidationError",
  { message: Schema.String },
) {}

export class StoredConfigCorruptError extends Schema.TaggedError<StoredConfigCorruptError>()(
  "StoredConfigCorruptError",
  { message: Schema.String },
) {}

export class StoredConfigMissingError extends Schema.TaggedError<StoredConfigMissingError>()(
  "StoredConfigMissingError",
  { message: Schema.String },
) {}

export class ProfileNotFoundError extends Schema.TaggedError<ProfileNotFoundError>()(
  "ProfileNotFoundError",
  { message: Schema.String },
) {}

export class ImageAssetNotFoundError extends Schema.TaggedError<ImageAssetNotFoundError>()(
  "ImageAssetNotFoundError",
  {
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

export class StoredUnmappedFolderCorruptError extends Schema.TaggedError<StoredUnmappedFolderCorruptError>()(
  "StoredUnmappedFolderCorruptError",
  { message: Schema.String },
) {}

export type StoredConfigReadError = StoredConfigCorruptError | StoredConfigMissingError;

export const isStoredConfigReadError = Schema.is(
  Schema.Union(StoredConfigCorruptError, StoredConfigMissingError),
);

export type SystemConfigServiceError =
  | ConfigValidationError
  | DiskSpaceError
  | StoredConfigReadError
  | ProfileNotFoundError;
