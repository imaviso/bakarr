import { Schema } from "effect";

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainPathError,
  StoredDataError,
} from "@/features/errors.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { ImageCacheError } from "@/features/media/metadata/media-image-cache-service.ts";

export { DomainConflictError as MediaConflictError } from "@/features/errors.ts";
export { DomainNotFoundError as MediaNotFoundError } from "@/features/errors.ts";
export { DomainPathError as MediaPathError } from "@/features/errors.ts";
export { StoredDataError as MediaStoredDataError } from "@/features/errors.ts";

export class AniDbRuntimeConfigError extends Schema.TaggedError<AniDbRuntimeConfigError>()(
  "AniDbRuntimeConfigError",
  { cause: Schema.Defect, message: Schema.String },
) {}

export type MediaServiceError =
  | DomainNotFoundError
  | DomainConflictError
  | DomainPathError
  | StoredDataError
  | AniDbRuntimeConfigError
  | ImageCacheError
  | ExternalCallError;
