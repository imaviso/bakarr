import { Schema } from "effect";

import { DiskSpaceError } from "./disk-space.ts";

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

export type StoredConfigReadError = StoredConfigCorruptError | StoredConfigMissingError;

export const isStoredConfigReadError = Schema.is(
  Schema.Union(StoredConfigCorruptError, StoredConfigMissingError),
);

export type SystemServiceError =
  | ConfigValidationError
  | DiskSpaceError
  | StoredConfigReadError
  | ProfileNotFoundError;
