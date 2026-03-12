import { Schema } from "effect";

export class ConfigValidationError
  extends Schema.TaggedError<ConfigValidationError>()(
    "ConfigValidationError",
    { message: Schema.String },
  ) {}

export class ProfileNotFoundError
  extends Schema.TaggedError<ProfileNotFoundError>()(
    "ProfileNotFoundError",
    { message: Schema.String },
  ) {}

export type SystemServiceError = ConfigValidationError | ProfileNotFoundError;
