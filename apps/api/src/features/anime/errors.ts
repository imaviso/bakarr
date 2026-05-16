import { Schema } from "effect";

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainPathError,
  StoredDataError,
} from "@/features/errors.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { ImageCacheError } from "@/features/anime/metadata/anime-image-cache-service.ts";

export { DomainConflictError as AnimeConflictError } from "@/features/errors.ts";
export { DomainNotFoundError as AnimeNotFoundError } from "@/features/errors.ts";
export { DomainPathError as AnimePathError } from "@/features/errors.ts";
export { StoredDataError as AnimeStoredDataError } from "@/features/errors.ts";

export class AniDbRuntimeConfigError extends Schema.TaggedError<AniDbRuntimeConfigError>()(
  "AniDbRuntimeConfigError",
  { cause: Schema.Defect, message: Schema.String },
) {}

export type AnimeServiceError =
  | DomainNotFoundError
  | DomainConflictError
  | DomainPathError
  | StoredDataError
  | AniDbRuntimeConfigError
  | ImageCacheError
  | ExternalCallError;
