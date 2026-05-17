import { Match, Schema } from "effect";

import { AniDbRuntimeConfigError } from "@/features/media/errors.ts";
import { ImageCacheError } from "@/features/media/metadata/media-image-cache-service.ts";
import {
  StreamAccessError,
  StreamRangeError,
} from "@/features/media/stream/media-stream-errors.ts";
import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import { errorStatus, messageStatus } from "@/http/shared/route-errors/helpers.ts";

const MediaRouteErrorSchema = Schema.Union(
  AniDbRuntimeConfigError,
  ImageCacheError,
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
  StreamAccessError: errorStatus,
  StreamRangeError: (error) => ({
    headers: { "Content-Range": `bytes */${error.fileSize}` },
    message: error.message,
    status: error.status,
  }),
};

const isMediaRouteError = Schema.is(MediaRouteErrorSchema);

export function mapMediaRouteError(error: unknown): RouteErrorResponse | undefined {
  if (!isMediaRouteError(error)) {
    return undefined;
  }

  return Match.valueTags(error, mediaRouteErrorMappers);
}
