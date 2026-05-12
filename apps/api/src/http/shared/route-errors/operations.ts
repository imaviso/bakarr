import { Match, Schema } from "effect";

import {
  DomainConflictError,
  DomainInputError,
  DomainNotFoundError,
  DomainPathError,
  InfrastructureError,
  StoredDataError,
} from "@/features/errors.ts";
import {
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "@/features/operations/errors.ts";
import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import { fixedStatus, messageStatus } from "@/http/shared/route-errors/helpers.ts";

const OperationsRouteErrorSchema = Schema.Union(
  DomainConflictError,
  DomainInputError,
  DomainNotFoundError,
  DomainPathError,
  InfrastructureError,
  StoredDataError,
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
  DomainConflictError: messageStatus(409),
  DomainInputError: messageStatus(400),
  DomainNotFoundError: messageStatus(404),
  DomainPathError: messageStatus(400),
  InfrastructureError: messageStatus(500),
  RssFeedParseError: invalidRssFeed,
  RssFeedRejectedError: messageStatus(400),
  RssFeedTooLargeError: rssTooLarge,
  StoredDataError: messageStatus(500),
};

const isOperationsRouteError = Schema.is(OperationsRouteErrorSchema);

export function mapOperationsRouteError(error: unknown): RouteErrorResponse | undefined {
  if (!isOperationsRouteError(error)) {
    return undefined;
  }

  return Match.valueTags(error, operationsRouteErrorMappers);
}
