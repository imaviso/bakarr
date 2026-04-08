import { Match, Schema } from "effect";

import type { RouteErrorResponse } from "@/http/route-types.ts";
import { DatabaseError } from "@/db/database.ts";
import { WorkerTimeoutError } from "@/background-workers.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";
import { PasswordError } from "@/security/password.ts";
import { TokenHasherError } from "@/security/token-hasher.ts";
import { RequestValidationError } from "@/http/route-validation.ts";
import { mapAnimeRouteError } from "@/http/route-errors-anime.ts";
import { mapOperationsRouteError } from "@/http/route-errors-operations.ts";
import { mapSystemRouteError } from "@/http/route-errors-system.ts";

const commonTaggedRouteErrorSchemas = [
  DatabaseError,
  ExternalCallError,
  PasswordError,
  RequestValidationError,
  TokenHasherError,
  WorkerTimeoutError,
] as const;

type CommonRouteError = Schema.Schema.Type<Schema.Union<[...typeof commonTaggedRouteErrorSchemas]>>;

type TaggedCommonRouteError = Extract<CommonRouteError, { _tag: string }>;
type TaggedCommonRouteErrorTag = TaggedCommonRouteError["_tag"];

const messageStatus = (status: number) => (error: { readonly message: string }) => ({
  message: error.message,
  status,
});

const serviceUnavailable = () => ({
  message: "External service unavailable",
  status: 503,
});

const authCryptoFailure = () => ({
  message: "Authentication crypto failed",
  status: 500,
});

const taggedCommonRouteErrorMappers: {
  [K in TaggedCommonRouteErrorTag]: (
    error: Extract<TaggedCommonRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  DatabaseError: messageStatus(500),
  ExternalCallError: serviceUnavailable,
  PasswordError: authCryptoFailure,
  RequestValidationError: (error) => ({
    message: error.message,
    status: error.status,
  }),
  TokenHasherError: authCryptoFailure,
  WorkerTimeoutError: messageStatus(500),
};

const CommonRouteErrorSchema = Schema.Union(...commonTaggedRouteErrorSchemas);

const isCommonTaggedRouteError = Schema.is(CommonRouteErrorSchema);

export function mapRouteError(error: unknown): RouteErrorResponse {
  const animeRouteError = mapAnimeRouteError(error);
  if (animeRouteError !== undefined) {
    return animeRouteError;
  }

  const operationsRouteError = mapOperationsRouteError(error);
  if (operationsRouteError !== undefined) {
    return operationsRouteError;
  }

  const systemRouteError = mapSystemRouteError(error);
  if (systemRouteError !== undefined) {
    return systemRouteError;
  }

  if (isCommonTaggedRouteError(error)) {
    return mapTaggedCommonRouteError(error);
  }

  return { message: "Unexpected server error", status: 500 };
}

function mapTaggedCommonRouteError(error: TaggedCommonRouteError): RouteErrorResponse {
  return Match.valueTags(error, taggedCommonRouteErrorMappers);
}
