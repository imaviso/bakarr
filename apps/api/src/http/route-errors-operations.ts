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
import type { RouteErrorResponse } from "@/http/route-types.ts";

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

const messageStatus = (status: number) => (error: { readonly message: string }) => ({
  message: error.message,
  status,
});

const invalidRssFeed = () => ({
  message: "RSS feed response was invalid",
  status: 503,
});

const rssTooLarge = () => ({
  message: "RSS feed payload exceeded the allowed size",
  status: 503,
});

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
