import { Match, Schema } from "effect";

import { AniDbRuntimeConfigError } from "@/features/anime/errors.ts";
import { ImageCacheError } from "@/features/anime/anime-image-cache-service.ts";
import {
  DomainConflictError,
  DomainNotFoundError,
  DomainPathError,
  StoredDataError,
} from "@/features/errors.ts";
import {
  EpisodeStreamAccessError,
  EpisodeStreamRangeError,
} from "@/features/anime/anime-stream-errors.ts";
import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import { errorStatus, messageStatus } from "@/http/shared/route-errors/helpers.ts";

const AnimeRouteErrorSchema = Schema.Union(
  DomainConflictError,
  AniDbRuntimeConfigError,
  ImageCacheError,
  DomainNotFoundError,
  DomainPathError,
  StoredDataError,
  EpisodeStreamAccessError,
  EpisodeStreamRangeError,
);

type AnimeRouteError = Schema.Schema.Type<typeof AnimeRouteErrorSchema>;

const animeRouteErrorMappers: {
  [K in AnimeRouteError["_tag"]]: (
    error: Extract<AnimeRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  AniDbRuntimeConfigError: messageStatus(500),
  DomainConflictError: messageStatus(409),
  DomainNotFoundError: messageStatus(404),
  DomainPathError: messageStatus(400),
  ImageCacheError: messageStatus(500),
  EpisodeStreamAccessError: errorStatus,
  EpisodeStreamRangeError: (error) => ({
    headers: { "Content-Range": `bytes */${error.fileSize}` },
    message: error.message,
    status: error.status,
  }),
  StoredDataError: messageStatus(500),
};

const isAnimeRouteError = Schema.is(AnimeRouteErrorSchema);

export function mapAnimeRouteError(error: unknown): RouteErrorResponse | undefined {
  if (!isAnimeRouteError(error)) {
    return undefined;
  }

  return Match.valueTags(error, animeRouteErrorMappers);
}
