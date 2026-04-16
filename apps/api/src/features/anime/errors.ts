import { Schema } from "effect";

import { ExternalCallError } from "@/lib/effect-retry.ts";
import { ImageCacheError } from "@/features/anime/anime-image-cache-service.ts";

export class AnimeNotFoundError extends Schema.TaggedError<AnimeNotFoundError>()(
  "AnimeNotFoundError",
  { message: Schema.String },
) {}

export class AnimeConflictError extends Schema.TaggedError<AnimeConflictError>()(
  "AnimeConflictError",
  { message: Schema.String },
) {}

export class AnimePathError extends Schema.TaggedError<AnimePathError>()("AnimePathError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export class AnimeStoredDataError extends Schema.TaggedError<AnimeStoredDataError>()(
  "AnimeStoredDataError",
  { cause: Schema.Defect, message: Schema.String },
) {}

export class AniDbRuntimeConfigError extends Schema.TaggedError<AniDbRuntimeConfigError>()(
  "AniDbRuntimeConfigError",
  { cause: Schema.Defect, message: Schema.String },
) {}

export type AnimeServiceError =
  | AnimeNotFoundError
  | AnimeConflictError
  | AnimePathError
  | AnimeStoredDataError
  | AniDbRuntimeConfigError
  | ImageCacheError
  | ExternalCallError;
