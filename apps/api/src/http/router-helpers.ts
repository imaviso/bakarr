import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Cause, Effect, ParseResult, Schema } from "effect";

import { mapRouteError } from "./route-errors.ts";
import { mapAuthRouteError, requireViewerFromHttpRequest } from "./route-auth.ts";
import { formatValidationErrorMessage, RequestValidationError } from "./route-validation.ts";
import type { RouteErrorResponse } from "./route-types.ts";
import type { AuthUser } from "../../../../packages/shared/src/index.ts";

export const decodeJsonBody = <A, I, R>(schema: Schema.Schema<A, I, R>) =>
  HttpServerRequest.schemaBodyJson(schema);

export const decodeJsonBodyWithLabel = <A, I, R>(schema: Schema.Schema<A, I, R>, label: string) =>
  HttpServerRequest.schemaBodyJson(schema).pipe(
    Effect.catchTag("RequestError", () =>
      Effect.fail(
        RequestValidationError.make({
          message: `Invalid JSON for ${label}`,
          status: 400,
        }),
      ),
    ),
    Effect.catchAll((error) =>
      ParseResult.isParseError(error)
        ? Effect.fail(
            RequestValidationError.make({
              message: formatValidationErrorMessage(`Invalid request body for ${label}`, error),
              status: 400,
            }),
          )
        : Effect.fail(error),
    ),
  );

export const decodeOptionalJsonBody = <A, I, R>(input: {
  readonly empty: A;
  readonly label: string;
  readonly schema: Schema.Schema<A, I, R>;
}) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const text = yield* request.text;

    if (text.trim().length === 0) {
      return input.empty;
    }

    return yield* Schema.decode(Schema.parseJson(input.schema))(text).pipe(
      Effect.mapError((error) =>
        RequestValidationError.make({
          message: formatValidationErrorMessage(`Invalid request body for ${input.label}`, error),
          status: 400,
        }),
      ),
    );
  });

export const decodePathParams = <A, I extends Readonly<Record<string, string | undefined>>, R>(
  schema: Schema.Schema<A, I, R>,
) => HttpRouter.schemaPathParams(schema);

export const decodeQuery = <
  A,
  I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  R,
>(
  schema: Schema.Schema<A, I, R>,
) => HttpServerRequest.schemaSearchParams(schema);

export const decodeQueryWithLabel = <
  A,
  I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  R,
>(
  schema: Schema.Schema<A, I, R>,
  label: string,
) =>
  HttpServerRequest.schemaSearchParams(schema).pipe(
    Effect.catchAll((error) =>
      ParseResult.isParseError(error)
        ? Effect.fail(
            RequestValidationError.make({
              message: formatValidationErrorMessage(`Invalid query parameters for ${label}`, error),
              status: 400,
            }),
          )
        : Effect.fail(error),
    ),
  );

export const routeResponse = <A, E, R, E2, R2>(
  effect: Effect.Effect<A, E, R>,
  onSuccess: (value: A) => Effect.Effect<HttpServerResponse.HttpServerResponse, E2, R2>,
  mapError: (error: unknown) => RouteErrorResponse = mapRouteError,
) =>
  Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
    const url = new URL(request.url, "http://bakarr.local");

    return effect.pipe(
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
      Effect.catchAll((error) => Effect.succeed(mapToServerResponse(error, mapError))),
    );
  });

export const jsonResponse = <A>(value: A) => HttpServerResponse.json(value);

export const successResponse = () => HttpServerResponse.json({ data: null, success: true });

const withAuth = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.zipRight(requireViewerFromHttpRequest(), effect);

export const withAuthViewer = <A, E, R>(effect: (viewer: AuthUser) => Effect.Effect<A, E, R>) =>
  Effect.flatMap(requireViewerFromHttpRequest(), effect);

export const authedRouteResponse = <A, E, R, E2, R2>(
  effect: Effect.Effect<A, E, R>,
  onSuccess: (value: A) => Effect.Effect<HttpServerResponse.HttpServerResponse, E2, R2>,
  mapError: (error: unknown) => RouteErrorResponse = mapAuthRouteError,
) => routeResponse(withAuth(effect), onSuccess, mapError);

function mapToServerResponse(error: unknown, mapError: (error: unknown) => RouteErrorResponse) {
  if (ParseResult.isParseError(error)) {
    return HttpServerResponse.text("Invalid request", { status: 400 });
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "RequestError"
  ) {
    return HttpServerResponse.text("Invalid request", { status: 400 });
  }

  const mapped = mapError(error);
  const response = HttpServerResponse.text(mapped.message, {
    status: mapped.status,
  });

  return mapped.headers ? HttpServerResponse.setHeaders(response, mapped.headers) : response;
}
