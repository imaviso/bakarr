import { Match } from "effect";

import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import { DatabaseError } from "@/db/database.ts";
import { WorkerTimeoutError } from "@/background/workers.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { PasswordError } from "@/security/password.ts";
import { TokenHasherError } from "@/security/token-hasher.ts";
import { RequestValidationError } from "@/http/shared/route-validation.ts";
import { mapAnimeRouteError } from "@/http/shared/route-errors/anime.ts";
import { mapOperationsRouteError } from "@/http/shared/route-errors/operations.ts";
import { mapSystemRouteError } from "@/http/shared/route-errors/system.ts";
import { fixedStatus, messageStatus } from "@/http/shared/route-errors/helpers.ts";

type CommonRouteError =
  | DatabaseError
  | ExternalCallError
  | PasswordError
  | RequestValidationError
  | TokenHasherError
  | WorkerTimeoutError;

const serviceUnavailable = fixedStatus("External service unavailable", 503);

const authCryptoFailure = fixedStatus("Authentication crypto failed", 500);

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
