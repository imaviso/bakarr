import { Match, Schema } from "effect";

import {
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInfrastructureError,
  OperationsInputError,
  OperationsPathError,
  OperationsStoredDataError,
  OperationsTaskNotFoundError,
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "@/features/operations/errors.ts";
import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import { fixedStatus, messageStatus } from "@/http/shared/route-errors/helpers.ts";

const OperationsRouteErrorSchema = Schema.Union(
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInfrastructureError,
  OperationsInputError,
  OperationsPathError,
  OperationsStoredDataError,
  OperationsTaskNotFoundError,
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
);

type OperationsRouteError = Schema.Schema.Type<typeof OperationsRouteErrorSchema>;

const invalidRssFeed = fixedStatus("RSS feed response was invalid", 503);

const rssTooLarge = fixedStatus("RSS feed payload exceeded the allowed size", 503);

const operationsRouteErrorMappers: {
  [K in OperationsRouteError["_tag"]]: (
    error: Extract<OperationsRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  DownloadConflictError: messageStatus(409),
  DownloadNotFoundError: messageStatus(404),
  OperationsAnimeNotFoundError: messageStatus(404),
  OperationsConflictError: messageStatus(409),
  OperationsInfrastructureError: messageStatus(500),
  OperationsInputError: messageStatus(400),
  OperationsPathError: messageStatus(400),
  OperationsStoredDataError: messageStatus(500),
  OperationsTaskNotFoundError: messageStatus(404),
  RssFeedParseError: invalidRssFeed,
  RssFeedRejectedError: messageStatus(400),
  RssFeedTooLargeError: rssTooLarge,
};

const isOperationsRouteError = Schema.is(OperationsRouteErrorSchema);

export function mapOperationsRouteError(error: unknown): RouteErrorResponse | undefined {
  if (!isOperationsRouteError(error)) {
    return undefined;
  }

  return Match.valueTags(error, operationsRouteErrorMappers);
}
