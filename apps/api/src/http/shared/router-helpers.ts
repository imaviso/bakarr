import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { Cause, Effect, Option, Schema } from "effect";

import { mapRouteError } from "@/http/shared/route-errors/index.ts";
import { requireViewerFromHttpRequest } from "@/http/shared/route-auth.ts";
import {
  formatValidationErrorMessage,
  RequestValidationError,
} from "@/http/shared/route-validation.ts";
import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import type { AuthUser } from "@packages/shared/index.ts";

export const decodeJsonBodyWithLabel = <A, I, R>(schema: Schema.Codec<A, I, R, R>, label: string) =>
  HttpServerRequest.schemaBodyJson(schema).pipe(
    Effect.mapError((error) => mapLabeledBodyDecodeError(label, error)),
  );

export const decodeOptionalJsonBodyWithLabel = <A, I, R>(
  schema: Schema.Codec<A, I, R, R>,
  label: string,
  emptyBodyValue: A,
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const text = yield* request.text;

    if (text.trim().length === 0) {
      return emptyBodyValue;
    }

    return yield* Schema.decodeEffect(Schema.fromJsonString(schema))(text).pipe(
      Effect.mapError((error) => mapLabeledBodyDecodeError(label, error)),
    );
  });

export const decodePathParams = <A, I extends Readonly<Record<string, string | undefined>>, R>(
  schema: Schema.Codec<A, I, R, R>,
) =>
  HttpRouter.schemaPathParams(schema).pipe(
    Effect.mapError((error) => mapParseValidationError(error, "Invalid path parameters")),
  );

export const decodeQuery = <
  A,
  I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  R,
>(
  schema: Schema.Codec<A, I, R, R>,
) =>
  HttpServerRequest.schemaSearchParams(schema).pipe(
    Effect.mapError((error) => mapParseValidationError(error, "Invalid query parameters")),
  );

export const decodeQueryWithLabel = <
  A,
  I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  R,
>(
  schema: Schema.Codec<A, I, R, R>,
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
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          const failure = Cause.findErrorOption(cause);
          const mapped = Option.match(failure, {
            onNone: (): RouteErrorResponse => ({ message: "Unexpected server error", status: 500 }),
            onSome: (error) => mapError(error),
          });
          const logAsError = mapped.status >= 500 || Option.isNone(failure);

          yield* (
            logAsError ? Effect.logError("HTTP route failed") : Effect.logDebug("HTTP route failed")
          ).pipe(
            Effect.annotateLogs({
              cause: Cause.pretty(cause),
              ...Option.match(failure, {
                onNone: () => ({ error_kind: "defect" }),
                onSome: (error) => ({ error_kind: describeRouteFailure(error) }),
              }),
              http_method: request.method,
              http_path: url.pathname,
              http_status: mapped.status,
            }),
          );

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

/**
 * Encodes a value to JSON like v3's `HttpServerResponse.schemaJson` did:
 * `undefined`-valued optional fields are omitted from the wire, not emitted as
 * `null` (v4's `schemaJson` uses `toCodecJson`, which maps undefined → null).
 */
export const encodeSchemaJsonResponse = <A, I, R>(
  schema: Schema.Codec<A, I, R, R>,
  value: A,
  options?: Parameters<typeof HttpServerResponse.json>[1],
) =>
  Effect.flatMap(Schema.encodeEffect(schema)(value), (encoded) =>
    HttpServerResponse.json(encoded, options),
  );

export const schemaJsonResponse = <A, I, R>(schema: Schema.Codec<A, I, R, R>) => {
  const encodeResponse = (value: A) => encodeSchemaJsonResponse(schema, value);
  return encodeResponse;
};

const SuccessResponseSchema = Schema.Struct({
  data: Schema.Null,
  success: Schema.Literal(true),
});

export const successResponse = () =>
  encodeSchemaJsonResponse(SuccessResponseSchema, { data: null, success: true });

export const schemaAcceptedResponse =
  <A, I, R>(schema: Schema.Codec<A, I, R, R>) =>
  (value: A) =>
    encodeSchemaJsonResponse(
      Schema.Struct({ data: schema, success: Schema.Literal(true) }),
      { data: value, success: true },
      { status: 202 },
    );

export const withAuthViewer = <A, E, R>(
  effect: (viewer: AuthUser) => Effect.Effect<A, E, R>,
  options: { readonly allowPasswordChangeRequired?: boolean } = {},
) => Effect.flatMap(requireViewerFromHttpRequest(options), effect);

export const authedRouteResponse = <A, E, R, E2, R2>(
  effect: Effect.Effect<A, E, R>,
  onSuccess: (value: A) => Effect.Effect<HttpServerResponse.HttpServerResponse, E2, R2>,
  mapError: (error: unknown) => RouteErrorResponse = mapRouteError,
) => routeResponse(Effect.andThen(requireViewerFromHttpRequest(), effect), onSuccess, mapError);

function mapParseValidationError(error: unknown, message: string) {
  if (!Schema.isSchemaError(error)) {
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
    error._tag === "HttpServerError" &&
    "reason" in error &&
    typeof error.reason === "object" &&
    error.reason !== null &&
    "_tag" in error.reason &&
    error.reason._tag === "RequestParseError"
  ) {
    return RequestValidationError.make({
      cause: error,
      message: `Invalid JSON for ${label}`,
      status: 400,
    });
  }

  if (Schema.isSchemaError(error)) {
    return RequestValidationError.make({
      cause: error,
      message: formatValidationErrorMessage(`Invalid request body for ${label}`, error),
      status: 400,
    });
  }

  return error;
}

function describeRouteFailure(error: unknown): string {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    return String(error._tag);
  }

  if (error instanceof Error) {
    return error.constructor.name;
  }

  return typeof error;
}
