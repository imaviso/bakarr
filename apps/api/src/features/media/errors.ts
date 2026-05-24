import { Schema } from "effect";

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainPathError,
  StoredDataError,
} from "@/features/errors.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { ImageCacheError } from "@/features/media/metadata/media-image-cache-service.ts";

export class MediaNotFoundError extends Schema.TaggedError<MediaNotFoundError>()(
  "MediaNotFoundError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class MediaConflictError extends Schema.TaggedError<MediaConflictError>()(
  "MediaConflictError",
  { cause: Schema.optional(Schema.Defect), message: Schema.String },
) {}

export class AniDbRuntimeConfigError extends Schema.TaggedError<AniDbRuntimeConfigError>()(
  "AniDbRuntimeConfigError",
  { cause: Schema.Defect, message: Schema.String },
) {}

export type MediaServiceError =
  | MediaNotFoundError
  | MediaConflictError
  | DomainNotFoundError
  | DomainConflictError
  | DomainPathError
  | StoredDataError
  | AniDbRuntimeConfigError
  | ImageCacheError
  | ExternalCallError;
