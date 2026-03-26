import { Schema } from "effect";

import type { RouteErrorResponse } from "./route-types.ts";
import { DatabaseError } from "../db/database.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
  AnimeStoredDataError,
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
  OperationsStoredDataError,
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "../features/operations/errors.ts";
import {
  ConfigValidationError,
  ProfileNotFoundError,
  StoredUnmappedFolderCorruptError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
} from "../features/system/errors.ts";
import { DiskSpaceError } from "../features/system/disk-space.ts";
import { EpisodeStreamRangeError } from "./streaming-errors.ts";
import { RequestValidationError } from "./route-validation.ts";

const knownTaggedRouteErrorSchemas = [
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
  AnimeStoredDataError,
  AuthError,
  ConfigValidationError,
  DatabaseError,
  DiskSpaceError,
  DownloadConflictError,
  DownloadNotFoundError,
  EpisodeStreamRangeError,
  ExternalCallError,
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInputError,
  OperationsPathError,
  OperationsStoredDataError,
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
  ProfileNotFoundError,
  RequestValidationError,
  StoredUnmappedFolderCorruptError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
] as const;

type KnownRouteError = Schema.Schema.Type<Schema.Union<[...typeof knownTaggedRouteErrorSchemas]>>;

type TaggedRouteError = Extract<KnownRouteError, { _tag: string }>;
type TaggedRouteErrorTag = TaggedRouteError["_tag"];

const taggedRouteErrorMappers: {
  [K in TaggedRouteErrorTag]: (error: Extract<TaggedRouteError, { _tag: K }>) => RouteErrorResponse;
} = {
  AnimeConflictError: (error) => ({ message: error.message, status: 409 }),
  AnimeNotFoundError: (error) => ({ message: error.message, status: 404 }),
  AnimePathError: (error) => ({ message: error.message, status: 400 }),
  AnimeStoredDataError: (error) => ({ message: error.message, status: 500 }),
  AuthError: (error) => ({ message: error.message, status: error.status }),
  ConfigValidationError: (error) => ({ message: error.message, status: 400 }),
  DatabaseError: (error) => ({ message: error.message, status: 500 }),
  DiskSpaceError: (error) => ({ message: error.message, status: 500 }),
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
  OperationsStoredDataError: (error) => ({ message: error.message, status: 500 }),
  RssFeedParseError: () => ({
    message: "RSS feed response was invalid",
    status: 503,
  }),
  RssFeedRejectedError: (error) => ({ message: error.message, status: 400 }),
  RssFeedTooLargeError: () => ({
    message: "RSS feed payload exceeded the allowed size",
    status: 503,
  }),
  ProfileNotFoundError: (error) => ({ message: error.message, status: 404 }),
  RequestValidationError: (error) => ({
    message: error.message,
    status: error.status,
  }),
  StoredUnmappedFolderCorruptError: (error) => ({
    message: error.message,
    status: 500,
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

const KnownRouteErrorSchema = Schema.Union(...knownTaggedRouteErrorSchemas);

const isKnownTaggedRouteError = Schema.is(KnownRouteErrorSchema);

export function mapRouteError(error: unknown): RouteErrorResponse {
  if (isKnownTaggedRouteError(error)) {
    return mapTaggedRouteError(error);
  }

  if (error instanceof Error) {
    return { message: "Unexpected server error", status: 500 };
  }

  return { message: "Unexpected server error", status: 500 };
}

function mapTaggedRouteError<E extends TaggedRouteError>(error: E): RouteErrorResponse {
  const mapper = taggedRouteErrorMappers[error._tag] as (error: E) => RouteErrorResponse;

  return mapper(error);
}
