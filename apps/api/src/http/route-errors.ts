import { Schema } from "effect";

import type { RouteErrorResponse } from "./route-types.ts";
import { DatabaseError } from "../db/database.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
} from "../features/anime/errors.ts";
import { AuthError } from "../features/auth/service.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  ExternalCallError,
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInputError,
  OperationsPathError,
} from "../features/operations/errors.ts";
import {
  ConfigValidationError,
  ProfileNotFoundError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
} from "../features/system/errors.ts";
import { EpisodeStreamRangeError } from "./streaming-errors.ts";
import { RequestValidationError } from "./route-validation.ts";

export type KnownRouteError =
  | AnimeConflictError
  | AnimeNotFoundError
  | AnimePathError
  | AuthError
  | ConfigValidationError
  | DatabaseError
  | DownloadConflictError
  | DownloadNotFoundError
  | EpisodeStreamRangeError
  | ExternalCallError
  | OperationsAnimeNotFoundError
  | OperationsConflictError
  | OperationsInputError
  | OperationsPathError
  | ProfileNotFoundError
  | RequestValidationError
  | StoredConfigCorruptError
  | StoredConfigMissingError;

type TaggedRouteError = Extract<KnownRouteError, { _tag: string }>;
type TaggedRouteErrorTag = TaggedRouteError["_tag"];

const taggedRouteErrorMappers: {
  [K in TaggedRouteErrorTag]: (
    error: Extract<TaggedRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  AnimeConflictError: (error) => ({ message: error.message, status: 409 }),
  AnimeNotFoundError: (error) => ({ message: error.message, status: 404 }),
  AnimePathError: (error) => ({ message: error.message, status: 400 }),
  AuthError: (error) => ({ message: error.message, status: error.status }),
  ConfigValidationError: (error) => ({ message: error.message, status: 400 }),
  DatabaseError: (error) => ({ message: error.message, status: 500 }),
  DownloadConflictError: (error) => ({ message: error.message, status: 409 }),
  DownloadNotFoundError: (error) => ({ message: error.message, status: 404 }),
  EpisodeStreamRangeError: (error) => ({
    headers: { "Content-Range": `bytes */${error.fileSize}` },
    message: error.message,
    status: error.status,
  }),
  ExternalCallError: () => ({
    message: "External service unavailable",
    status: 503,
  }),
  OperationsAnimeNotFoundError: (error) => ({
    message: error.message,
    status: 404,
  }),
  OperationsConflictError: (error) => ({
    message: error.message,
    status: 409,
  }),
  OperationsInputError: (error) => ({ message: error.message, status: 400 }),
  OperationsPathError: (error) => ({ message: error.message, status: 400 }),
  ProfileNotFoundError: (error) => ({ message: error.message, status: 404 }),
  RequestValidationError: (error) => ({
    message: error.message,
    status: error.status,
  }),
  StoredConfigCorruptError: (error) => ({
    message: error.message,
    status: 500,
  }),
  StoredConfigMissingError: (error) => ({
    message: error.message,
    status: 500,
  }),
};

const KnownRouteErrorSchema = Schema.Union(
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
  AuthError,
  ConfigValidationError,
  DatabaseError,
  DownloadConflictError,
  DownloadNotFoundError,
  EpisodeStreamRangeError,
  ExternalCallError,
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInputError,
  OperationsPathError,
  ProfileNotFoundError,
  RequestValidationError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
);

const isKnownTaggedRouteError = Schema.is(KnownRouteErrorSchema);

export function mapRouteError(error: unknown): RouteErrorResponse {
  if (isKnownTaggedRouteError(error)) {
    return mapTaggedRouteError(error);
  }

  if (error instanceof Error) {
    return { message: error.message, status: 500 };
  }

  return { message: "Unexpected server error", status: 500 };
}

function mapTaggedRouteError<E extends TaggedRouteError>(
  error: E,
): RouteErrorResponse {
  const mapper = taggedRouteErrorMappers[error._tag] as (
    error: E,
  ) => RouteErrorResponse;

  return mapper(error);
}
