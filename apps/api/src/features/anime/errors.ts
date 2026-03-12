import { Schema } from "effect";

export class AnimeNotFoundError
  extends Schema.TaggedError<AnimeNotFoundError>()(
    "AnimeNotFoundError",
    { message: Schema.String },
  ) {}

export class AnimeConflictError
  extends Schema.TaggedError<AnimeConflictError>()(
    "AnimeConflictError",
    { message: Schema.String },
  ) {}

export type AnimeServiceError = AnimeNotFoundError | AnimeConflictError;
