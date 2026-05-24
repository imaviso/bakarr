import { Match, Schema } from "effect";

import {
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
  OperationsConflictError,
  OperationsNotFoundError,
} from "@/features/operations/errors.ts";
import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import {
  fixedStatus,
  mapTaggedRouteError,
  messageStatus,
} from "@/http/shared/route-errors/helpers.ts";

const OperationsRouteErrorSchema = Schema.Union(
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
  OperationsConflictError,
  OperationsNotFoundError,
);

type OperationsRouteError = Schema.Schema.Type<typeof OperationsRouteErrorSchema>;

const invalidRssFeed = fixedStatus("RSS feed response was invalid", 503);

const rssTooLarge = fixedStatus("RSS feed payload exceeded the allowed size", 503);

const operationsRouteErrorMappers: {
  [K in OperationsRouteError["_tag"]]: (
    error: Extract<OperationsRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  RssFeedParseError: invalidRssFeed,
  RssFeedRejectedError: messageStatus(400),
  RssFeedTooLargeError: rssTooLarge,
  OperationsConflictError: messageStatus(409),
  OperationsNotFoundError: messageStatus(404),
};

export const mapOperationsRouteError = mapTaggedRouteError(OperationsRouteErrorSchema, (error) =>
  Match.valueTags(error, operationsRouteErrorMappers),
);
