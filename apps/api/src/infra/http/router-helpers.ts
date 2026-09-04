// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Cause, Effect, Option, Predicate, Record, Schema } from "effect";

import { collectBoundedText, StreamPayloadTooLargeError } from "@/infra/effect/bounded-stream.ts";
import { mapRouteError } from "@/infra/http/route-errors/index.ts";
import { requireViewerFromHttpRequest } from "@/infra/http/route-auth.ts";
import {
  formatValidationErrorMessage,
  RequestValidationError,
} from "@/infra/http/route-validation.ts";
import type { RouteErrorResponse } from "@/infra/http/route-types.ts";

export const MAX_JSON_BODY_BYTES = 1_048_576;

export const decodeJsonBodyWithLabel = <A, I, R>(schema: Schema.Codec<A, I, R>, label: string) =>
  readBoundedRequestText.pipe(Effect.flatMap((text) => decodeJsonText(schema, label, text)));

export const decodeOptionalJsonBodyWithLabel = <A, I, R>(
  schema: Schema.Codec<A, I, R>,
  label: string,
  emptyBodyValue: A,
) =>
  Effect.gen(function* () {
    const text = yield* readBoundedRequestText;

    if (text.trim().length === 0) {
      return emptyBodyValue;
    }

    return yield* decodeJsonText(schema, label, text);
  });

const readBoundedRequestText = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const contentLength = request.headers["content-length"];

  if (contentLength !== undefined && Number(contentLength) > MAX_JSON_BODY_BYTES) {
    return yield* new StreamPayloadTooLargeError({
      actualBytes: Number(contentLength),
      maxBytes: MAX_JSON_BODY_BYTES,
    });
  }

  return yield* collectBoundedText(request.stream, MAX_JSON_BODY_BYTES);
});

const decodeJsonText = <A, I, R>(schema: Schema.Codec<A, I, R>, label: string, text: string) =>
  Effect.flatMap(parseJsonText(text, label), (json) =>
    Schema.decodeUnknownEffect(schema)(json).pipe(
      Effect.mapError((error) => mapLabeledBodyDecodeError(label, error)),
    ),
  );

const parseJsonText = (text: string, label: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(text).pipe(
    Effect.mapError((cause) =>
      RequestValidationError.make({
        cause,
        message: `Invalid JSON for ${label}`,
        status: 400,
      }),
    ),
  );

export const decodePathParams = <A, I extends Readonly<Record<string, string | undefined>>, R>(
  schema: Schema.Codec<A, I, R>,
) =>
  HttpRouter.schemaPathParams(schema).pipe(
    Effect.mapError((error) => mapParseValidationError(error, "Invalid path parameters")),
  );

export const decodeQuery = <
  A,
  I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  R,
>(
  schema: Schema.Codec<A, I, R>,
) =>
  HttpServerRequest.schemaSearchParams(schema).pipe(
    Effect.mapError((error) => mapParseValidationError(error, "Invalid query parameters")),
  );

export const decodeQueryWithLabel = <
  A,
  I extends Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
  R,
>(
  schema: Schema.Codec<A, I, R>,
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
      Effect.flatMap((value) => onSuccess(value)),
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          // Client disconnects and shutdown surface as interrupt-only causes.
          // The response channel is already dead: re-interrupt quietly instead
          // of mapping the request to a 500 and logging an error.
          if (Cause.hasInterruptsOnly(cause)) {
            return yield* Effect.interrupt;
          }

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

export const schemaJsonResponse = <A, I, R>(schema: Schema.Codec<A, I, R>) =>
  HttpServerResponse.schemaJson(schema);

const SuccessResponseSchema = Schema.Struct({
  data: Schema.Null,
  success: Schema.Literal(true),
});

export const successResponse = () =>
  HttpServerResponse.schemaJson(SuccessResponseSchema)({ data: null, success: true });

export const schemaAcceptedResponse =
  <A, I, R>(schema: Schema.Codec<A, I, R>) =>
  (value: A) =>
    HttpServerResponse.schemaJson(Schema.Struct({ data: schema, success: Schema.Literal(true) }))(
      { data: value, success: true },
      { status: 202 },
    );

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
  if (Predicate.hasProperty(error, "_tag")) {
    return globalThis.String(error._tag);
  }

  if (error instanceof Error) {
    return error.constructor.name;
  }

  return typeof error;
}
