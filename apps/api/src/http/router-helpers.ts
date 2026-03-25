import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, ParseResult, Schema } from "effect";

import { mapRouteError } from "./route-errors.ts";

export const decodeJsonBody = <A, I, R>(schema: Schema.Schema<A, I, R>) =>
  HttpServerRequest.schemaBodyJson(schema);

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

export const routeResponse = <A, E, R, E2, R2>(
  effect: Effect.Effect<A, E, R>,
  onSuccess: (value: A) => Effect.Effect<HttpServerResponse.HttpServerResponse, E2, R2>,
) =>
  effect.pipe(
    Effect.flatMap(onSuccess),
    Effect.catchAll((error) => Effect.succeed(mapToServerResponse(error))),
  );

export const jsonResponse = <A>(value: A) => HttpServerResponse.json(value);

export const successResponse = () => HttpServerResponse.json({ data: null, success: true });

function mapToServerResponse(error: unknown) {
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

  const mapped = mapRouteError(error);
  const response = HttpServerResponse.text(mapped.message, {
    status: mapped.status,
  });

  return mapped.headers ? HttpServerResponse.setHeaders(response, mapped.headers) : response;
}
