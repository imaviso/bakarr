import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Cause, Effect, Option, ParseResult, Schema } from "effect";

import { mapRouteError } from "@/http/route-errors.ts";
import { mapAuthRouteError, requireViewerFromHttpRequest } from "@/http/route-auth.ts";
import { formatValidationErrorMessage, RequestValidationError } from "@/http/route-validation.ts";
import type { RouteErrorResponse } from "@/http/route-types.ts";
import type { AuthUser } from "@packages/shared/index.ts";

export const decodeJsonBodyWithLabel = <A, I, R>(schema: Schema.Schema<A, I, R>, label: string) =>
  HttpServerRequest.schemaBodyJson(schema).pipe(
    Effect.mapError((error) => mapLabeledBodyDecodeError(label, error)),
  );

export const decodeOptionalJsonBodyWithLabel = <A, I, R>(
  schema: Schema.Schema<A, I, R>,
  label: string,
  emptyBodyValue: A,
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const text = yield* request.text;

    if (text.trim().length === 0) {
      return emptyBodyValue;
    }

    return yield* Schema.decode(Schema.parseJson(schema))(text).pipe(
      Effect.mapError((error) => mapLabeledBodyDecodeError(label, error)),
    );
  });

export const decodePathParams = <A, I extends Readonly<Record<string, string | undefined>>, R>(
  schema: Schema.Schema<A, I, R>,
) =>
  HttpRouter.schemaPathParams(schema).pipe(
    Effect.mapError((error) => mapParseValidationError(error, "Invalid path parameters")),
  );

export const decodeQuery = <
  A,
  I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  R,
>(
  schema: Schema.Schema<A, I, R>,
) =>
  HttpServerRequest.schemaSearchParams(schema).pipe(
    Effect.mapError((error) => mapParseValidationError(error, "Invalid query parameters")),
  );

export const decodeQueryWithLabel = <
  A,
  I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  R,
>(
  schema: Schema.Schema<A, I, R>,
  label: string,
) =>
  HttpServerRequest.schemaSearchParams(schema).pipe(
    Effect.mapError((error) =>
      mapParseValidationError(error, `Invalid query parameters for ${label}`),
    ),
  );

export const routeResponse = <A, E, R, E2, R2>(
  effect: Effect.Effect<A, E, R>,
  onSuccess: (value: A) => Effect.Effect<HttpServerResponse.HttpServerResponse, E2, R2>,
  mapError: (error: unknown) => RouteErrorResponse = mapRouteError,
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, "http://bakarr.local");

    return yield* effect.pipe(
      Effect.flatMap(onSuccess),
      Effect.tapErrorCause((cause) =>
        Effect.logError("HTTP route failed").pipe(
          Effect.annotateLogs({
            cause: Cause.pretty(cause),
            http_method: request.method,
            http_path: url.pathname,
          }),
        ),
      ),
      Effect.catchAllCause((cause) =>
        Effect.sync(() => {
          const mapped = Option.match(Cause.failureOption(cause), {
            onNone: () => mapError(cause),
            onSome: (error) => mapError(error),
          });
          const response = HttpServerResponse.text(mapped.message, {
            status: mapped.status,
          });

          return mapped.headers
            ? HttpServerResponse.setHeaders(response, mapped.headers)
            : response;
        }),
      ),
    );
  });

export const jsonResponse = <A>(value: A) => HttpServerResponse.json(value);

export const successResponse = () => HttpServerResponse.json({ data: null, success: true });

export const withAuthViewer = <A, E, R>(effect: (viewer: AuthUser) => Effect.Effect<A, E, R>) =>
  Effect.flatMap(requireViewerFromHttpRequest(), effect);

export const authedRouteResponse = <A, E, R, E2, R2>(
  effect: Effect.Effect<A, E, R>,
  onSuccess: (value: A) => Effect.Effect<HttpServerResponse.HttpServerResponse, E2, R2>,
  mapError: (error: unknown) => RouteErrorResponse = mapAuthRouteError,
) => routeResponse(Effect.zipRight(requireViewerFromHttpRequest(), effect), onSuccess, mapError);

function mapParseValidationError(error: unknown, message: string) {
  if (!ParseResult.isParseError(error)) {
    return error;
  }

  return RequestValidationError.make({
    cause: error,
    message: formatValidationErrorMessage(message, error),
    status: 400,
  });
}

function mapLabeledBodyDecodeError(label: string, error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "RequestError"
  ) {
    return RequestValidationError.make({
      cause: error,
      message: `Invalid JSON for ${label}`,
      status: 400,
    });
  }

  if (ParseResult.isParseError(error)) {
    return RequestValidationError.make({
      cause: error,
      message: formatValidationErrorMessage(`Invalid request body for ${label}`, error),
      status: 400,
    });
  }

  return error;
}
