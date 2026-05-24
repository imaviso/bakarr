import { Match, Schema } from "effect";

import {
  AniDbRuntimeConfigError,
  MediaConflictError,
  MediaNotFoundError,
} from "@/features/media/errors.ts";
import { ImageCacheError } from "@/features/media/metadata/media-image-cache-service.ts";
import { ReaderAccessError } from "@/features/media/reader/media-reader-errors.ts";
import {
  StreamAccessError,
  StreamRangeError,
} from "@/features/media/stream/media-stream-errors.ts";
import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import {
  errorStatus,
  mapTaggedRouteError,
  messageStatus,
} from "@/http/shared/route-errors/helpers.ts";

const MediaRouteErrorSchema = Schema.Union(
  AniDbRuntimeConfigError,
  ImageCacheError,
  MediaConflictError,
  MediaNotFoundError,
  ReaderAccessError,
  StreamAccessError,
  StreamRangeError,
);

type MediaRouteError = Schema.Schema.Type<typeof MediaRouteErrorSchema>;

const mediaRouteErrorMappers: {
  [K in MediaRouteError["_tag"]]: (
    error: Extract<MediaRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  AniDbRuntimeConfigError: messageStatus(500),
  ImageCacheError: messageStatus(500),
  MediaConflictError: messageStatus(409),
  MediaNotFoundError: messageStatus(404),
  ReaderAccessError: errorStatus,
  StreamAccessError: errorStatus,
  StreamRangeError: (error) => ({
    headers: { "Content-Range": `bytes */${error.fileSize}` },
    message: error.message,
    status: error.status,
  }),
};

export const mapMediaRouteError = mapTaggedRouteError(MediaRouteErrorSchema, (error) =>
  Match.valueTags(error, mediaRouteErrorMappers),
);
