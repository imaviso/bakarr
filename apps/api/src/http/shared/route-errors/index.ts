import { Match, Schema } from "effect";

import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import { DatabaseError } from "@/db/database.ts";
import { WorkerTimeoutError } from "@/background/workers.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { PasswordError } from "@/security/password.ts";
import { TokenHasherError } from "@/security/token-hasher.ts";
import { RequestValidationError } from "@/http/shared/route-validation.ts";
import {
  AuthBadRequestError,
  type AuthError,
  AuthErrorSchema,
  AuthForbiddenError,
  AuthNotFoundError,
  AuthUnauthorizedError,
} from "@/features/auth/errors.ts";
import { mapMediaRouteError } from "@/http/shared/route-errors/media.ts";
import { mapOperationsRouteError } from "@/http/shared/route-errors/operations.ts";
import { mapSystemRouteError } from "@/http/shared/route-errors/system.ts";
import { fixedStatus } from "@/http/shared/route-errors/helpers.ts";
import {
  DomainConflictError,
  DomainInputError,
  DomainNotFoundError,
  DomainPathError,
  InfrastructureError,
  StoredDataError,
} from "@/features/errors.ts";

type CommonRouteError =
  | AuthError
  | DatabaseError
  | DomainConflictError
  | DomainInputError
  | DomainNotFoundError
  | DomainPathError
  | ExternalCallError
  | InfrastructureError
  | PasswordError
  | RequestValidationError
  | StoredDataError
  | TokenHasherError
  | WorkerTimeoutError;

const CommonRouteErrorSchema = Schema.Union(
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
  TokenHasherError,
  WorkerTimeoutError,
);

const serviceUnavailable = fixedStatus("External service unavailable", 503);

const authCryptoFailure = fixedStatus("Authentication crypto failed", 500);
const internalServerError = fixedStatus("Internal server error", 500);

const taggedCommonRouteErrorMappers = {
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
  TokenHasherError: authCryptoFailure,
  WorkerTimeoutError: internalServerError,
} as const;

const isCommonRouteError = Schema.is(CommonRouteErrorSchema);

export function mapRouteError(error: unknown): RouteErrorResponse {
  if (isCommonRouteError(error)) {
    return mapTaggedCommonRouteError(error);
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

function mapTaggedCommonRouteError(error: CommonRouteError): RouteErrorResponse {
  return Match.valueTags(error, taggedCommonRouteErrorMappers);
}
