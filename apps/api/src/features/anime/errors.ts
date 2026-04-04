import { Schema } from "effect";

import { ExternalCallError } from "@/lib/effect-retry.ts";

export class AnimeNotFoundError extends Schema.TaggedError<AnimeNotFoundError>()(
  "AnimeNotFoundError",
  { message: Schema.String },
) {}

export class AnimeConflictError extends Schema.TaggedError<AnimeConflictError>()(
  "AnimeConflictError",
  { message: Schema.String },
) {}

export class AnimePathError extends Schema.TaggedError<AnimePathError>()("AnimePathError", {
  message: Schema.String,
}) {}

export class AnimeStoredDataError extends Schema.TaggedError<AnimeStoredDataError>()(
  "AnimeStoredDataError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export type AnimeServiceError =
  | AnimeNotFoundError
  | AnimeConflictError
  | AnimePathError
  | AnimeStoredDataError
  | ExternalCallError;
