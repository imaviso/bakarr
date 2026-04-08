import { Match, Schema } from "effect";

import {
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
  AnimeStoredDataError,
} from "@/features/anime/errors.ts";
import {
  EpisodeStreamAccessError,
  EpisodeStreamRangeError,
} from "@/features/anime/anime-stream-errors.ts";
import type { RouteErrorResponse } from "@/http/route-types.ts";

const AnimeRouteErrorSchema = Schema.Union(
  AnimeConflictError,
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
