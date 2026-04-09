import { Match } from "effect";

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

type CommonRouteError =
  | DatabaseError
  | ExternalCallError
  | PasswordError
  | RequestValidationError
  | TokenHasherError
  | WorkerTimeoutError;

const messageStatus =
  (status: number) =>
  (error: { readonly message: string }): RouteErrorResponse => ({
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

const taggedCommonRouteErrorMappers = {
  DatabaseError: messageStatus(500),
  ExternalCallError: serviceUnavailable,
  PasswordError: authCryptoFailure,
  RequestValidationError: (error: RequestValidationError): RouteErrorResponse => ({
    message: error.message,
    status: error.status,
  }),
  TokenHasherError: authCryptoFailure,
  WorkerTimeoutError: messageStatus(500),
} as const;

function asCommonRouteError(error: unknown): CommonRouteError | undefined {
  if (
    error instanceof DatabaseError ||
    error instanceof ExternalCallError ||
    error instanceof PasswordError ||
    error instanceof RequestValidationError ||
    error instanceof TokenHasherError ||
    error instanceof WorkerTimeoutError
  ) {
    return error;
  }

  return undefined;
}

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

  const commonRouteError = asCommonRouteError(error);

  if (commonRouteError !== undefined) {
    return mapTaggedCommonRouteError(commonRouteError);
  }

  return { message: "Unexpected server error", status: 500 };
}

function mapTaggedCommonRouteError(error: CommonRouteError): RouteErrorResponse {
  return Match.valueTags(error, taggedCommonRouteErrorMappers);
}
