// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Match, Schema } from "effect";

import type { RouteErrorResponse } from "@/infra/http/route-types.ts";
import { DatabaseError } from "@/db/database.ts";
import { WorkerTimeoutError } from "@/background/workers.ts";
import { StreamPayloadTooLargeError } from "@/infra/effect/bounded-stream.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { PasswordError } from "@/security/password.ts";
import { TokenHasherError } from "@/security/token-hasher.ts";
import { RequestValidationError } from "@/infra/http/route-validation.ts";
import {
  AuthBadRequestError,
  AuthErrorSchema,
  AuthForbiddenError,
  AuthNotFoundError,
  AuthRateLimitedError,
  AuthUnauthorizedError,
} from "@/features/auth/errors.ts";
import { mapMediaRouteError } from "@/infra/http/route-errors/media.ts";
import { mapOperationsRouteError } from "@/infra/http/route-errors/operations.ts";
import { mapSystemRouteError } from "@/infra/http/route-errors/system.ts";
import { fixedStatus, mapTaggedRouteError } from "@/infra/http/route-errors/helpers.ts";
import {
  DomainConflictError,
  DomainInputError,
  DomainNotFoundError,
  DomainPathError,
  InfrastructureError,
  StoredDataError,
} from "@/features/errors.ts";

const CommonRouteErrorSchema = Schema.Union([
  AuthErrorSchema,
  DatabaseError,
  DomainConflictError,
  DomainInputError,
  DomainNotFoundError,
  DomainPathError,
  ExternalCallError,
  InfrastructureError,
  PasswordError,
  RequestValidationError,
  StoredDataError,
  StreamPayloadTooLargeError,
  TokenHasherError,
  WorkerTimeoutError,
]);

type CommonRouteError = Schema.Schema.Type<typeof CommonRouteErrorSchema>;

const serviceUnavailable = fixedStatus("External service unavailable", 503);

const authCryptoFailure = fixedStatus("Authentication crypto failed", 500);
const internalServerError = fixedStatus("Internal server error", 500);

const taggedCommonRouteErrorMappers: {
  [K in CommonRouteError["_tag"]]: (
    error: Extract<CommonRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  AuthBadRequestError: (error: AuthBadRequestError): RouteErrorResponse => ({
    message: error.message,
    status: 400,
  }),
  AuthForbiddenError: (error: AuthForbiddenError): RouteErrorResponse => ({
    message: error.message,
    status: 403,
  }),
  AuthNotFoundError: (error: AuthNotFoundError): RouteErrorResponse => ({
    message: error.message,
    status: 404,
  }),
  AuthRateLimitedError: (error: AuthRateLimitedError): RouteErrorResponse => ({
    headers: {
      "retry-after": globalThis.String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))),
    },
    message: error.message,
    status: 429,
  }),
  AuthUnauthorizedError: (error: AuthUnauthorizedError): RouteErrorResponse => ({
    message: error.message,
    status: 401,
  }),
  DatabaseError: internalServerError,
  DomainConflictError: (error: DomainConflictError): RouteErrorResponse => ({
    message: error.message,
    status: 409,
  }),
  DomainInputError: (error: DomainInputError): RouteErrorResponse => ({
    message: error.message,
    status: 400,
  }),
  DomainNotFoundError: (error: DomainNotFoundError): RouteErrorResponse => ({
    message: error.message,
    status: 404,
  }),
  DomainPathError: (error: DomainPathError): RouteErrorResponse => ({
    message: error.message,
    status: 400,
  }),
  ExternalCallError: serviceUnavailable,
  InfrastructureError: internalServerError,
  PasswordError: authCryptoFailure,
  RequestValidationError: (error: RequestValidationError): RouteErrorResponse => ({
    message: error.message,
    status: error.status,
  }),
  StoredDataError: (error: StoredDataError): RouteErrorResponse => ({
    message: error.message,
    status: 500,
  }),
  StreamPayloadTooLargeError: (error: StreamPayloadTooLargeError): RouteErrorResponse => ({
    message: `Request body exceeds the ${error.maxBytes} byte limit`,
    status: 413,
  }),
  TokenHasherError: authCryptoFailure,
  WorkerTimeoutError: internalServerError,
};

const mapCommonRouteError = mapTaggedRouteError(CommonRouteErrorSchema, (error) =>
  Match.valueTags(error, taggedCommonRouteErrorMappers),
);

export function mapRouteError(error: unknown): RouteErrorResponse {
  const commonRouteError = mapCommonRouteError(error);
  if (commonRouteError !== undefined) {
    return commonRouteError;
  }

  const mediaRouteError = mapMediaRouteError(error);
  if (mediaRouteError !== undefined) {
    return mediaRouteError;
  }

  const operationsRouteError = mapOperationsRouteError(error);
  if (operationsRouteError !== undefined) {
    return operationsRouteError;
  }

  const systemRouteError = mapSystemRouteError(error);
  if (systemRouteError !== undefined) {
    return systemRouteError;
  }

  return { message: "Unexpected server error", status: 500 };
}
