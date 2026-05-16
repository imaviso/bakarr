import { Match, Schema } from "effect";

import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import { DatabaseError } from "@/db/database.ts";
import { WorkerTimeoutError } from "@/background/workers.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { PasswordError } from "@/security/password.ts";
import { TokenHasherError } from "@/security/token-hasher.ts";
import { RequestValidationError } from "@/http/shared/route-validation.ts";
import { AuthError } from "@/features/auth/errors.ts";
import { mapAnimeRouteError } from "@/http/shared/route-errors/anime.ts";
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
  AuthError,
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

const authErrorStatuses = {
  BadRequest: 400,
  Forbidden: 403,
  NotFound: 404,
  Unauthorized: 401,
} satisfies Record<AuthError["kind"], 400 | 401 | 403 | 404>;

const taggedCommonRouteErrorMappers = {
  AuthError: (error: AuthError): RouteErrorResponse => ({
    message: error.message,
    status: mapAuthErrorStatus(error.kind),
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

  return { message: "Unexpected server error", status: 500 };
}

function mapTaggedCommonRouteError(error: CommonRouteError): RouteErrorResponse {
  return Match.valueTags(error, taggedCommonRouteErrorMappers);
}

function mapAuthErrorStatus(kind: AuthError["kind"]): 400 | 401 | 403 | 404 {
  return authErrorStatuses[kind];
}
