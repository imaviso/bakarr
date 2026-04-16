import { Match, Schema } from "effect";

import {
  AniDbRuntimeConfigError,
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
  AnimeStoredDataError,
} from "@/features/anime/errors.ts";
import { ImageCacheError } from "@/features/anime/anime-image-cache-service.ts";
import {
  EpisodeStreamAccessError,
  EpisodeStreamRangeError,
} from "@/features/anime/anime-stream-errors.ts";
import type { RouteErrorResponse } from "@/http/route-types.ts";

const AnimeRouteErrorSchema = Schema.Union(
  AnimeConflictError,
  AniDbRuntimeConfigError,
  ImageCacheError,
  AnimeNotFoundError,
  AnimePathError,
  AnimeStoredDataError,
  EpisodeStreamAccessError,
  EpisodeStreamRangeError,
);

type AnimeRouteError = Schema.Schema.Type<typeof AnimeRouteErrorSchema>;

const messageStatus = (status: number) => (error: { readonly message: string }) => ({
  message: error.message,
  status,
});

const animeRouteErrorMappers: {
  [K in AnimeRouteError["_tag"]]: (
    error: Extract<AnimeRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  AnimeConflictError: messageStatus(409),
  AniDbRuntimeConfigError: messageStatus(500),
  ImageCacheError: messageStatus(500),
  AnimeNotFoundError: messageStatus(404),
  AnimePathError: messageStatus(400),
  AnimeStoredDataError: messageStatus(500),
  EpisodeStreamAccessError: (error) => ({ message: error.message, status: error.status }),
  EpisodeStreamRangeError: (error) => ({
    headers: { "Content-Range": `bytes */${error.fileSize}` },
    message: error.message,
    status: error.status,
  }),
};

const isAnimeRouteError = Schema.is(AnimeRouteErrorSchema);

export function mapAnimeRouteError(error: unknown): RouteErrorResponse | undefined {
  if (!isAnimeRouteError(error)) {
    return;
  }

  return Match.valueTags(error, animeRouteErrorMappers);
}
