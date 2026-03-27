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
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInputError,
  OperationsPathError,
  OperationsStoredDataError,
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "../features/operations/errors.ts";
import { ExternalCallError } from "../lib/effect-retry.ts";
import { PasswordError } from "../security/password.ts";
import { TokenHasherError } from "../security/token-hasher.ts";
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
  PasswordError,
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
  ProfileNotFoundError,
  RequestValidationError,
  StoredUnmappedFolderCorruptError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
  TokenHasherError,
] as const;

type KnownRouteError = Schema.Schema.Type<Schema.Union<[...typeof knownTaggedRouteErrorSchemas]>>;

type TaggedRouteError = Extract<KnownRouteError, { _tag: string }>;
type TaggedRouteErrorTag = TaggedRouteError["_tag"];

const messageStatus = (status: number) => (error: { readonly message: string }) => ({
  message: error.message,
  status,
});

const serviceUnavailable = () => ({
  message: "External service unavailable",
  status: 503,
});

const invalidRssFeed = () => ({
  message: "RSS feed response was invalid",
  status: 503,
});

const rssTooLarge = () => ({
  message: "RSS feed payload exceeded the allowed size",
  status: 503,
});

const authCryptoFailure = () => ({
  message: "Authentication crypto failed",
  status: 500,
});

const taggedRouteErrorMappers: {
  [K in TaggedRouteErrorTag]: (error: Extract<TaggedRouteError, { _tag: K }>) => RouteErrorResponse;
} = {
  AnimeConflictError: messageStatus(409),
  AnimeNotFoundError: messageStatus(404),
  AnimePathError: messageStatus(400),
  AnimeStoredDataError: messageStatus(500),
  AuthError: (error) => ({ message: error.message, status: error.status }),
  ConfigValidationError: messageStatus(400),
  DatabaseError: messageStatus(500),
  DiskSpaceError: messageStatus(500),
  DownloadConflictError: messageStatus(409),
  DownloadNotFoundError: messageStatus(404),
  EpisodeStreamRangeError: (error) => ({
    headers: { "Content-Range": `bytes */${error.fileSize}` },
    message: error.message,
    status: error.status,
  }),
  ExternalCallError: serviceUnavailable,
  OperationsAnimeNotFoundError: messageStatus(404),
  OperationsConflictError: messageStatus(409),
  OperationsInputError: messageStatus(400),
  OperationsPathError: messageStatus(400),
  OperationsStoredDataError: messageStatus(500),
  PasswordError: authCryptoFailure,
  RssFeedParseError: invalidRssFeed,
  RssFeedRejectedError: messageStatus(400),
  RssFeedTooLargeError: rssTooLarge,
  ProfileNotFoundError: messageStatus(404),
  RequestValidationError: (error) => ({
    message: error.message,
    status: error.status,
  }),
  StoredUnmappedFolderCorruptError: messageStatus(500),
  StoredConfigCorruptError: messageStatus(500),
  StoredConfigMissingError: messageStatus(500),
  TokenHasherError: authCryptoFailure,
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
