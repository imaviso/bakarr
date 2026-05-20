import { Schema } from "effect";

import type { RouteErrorResponse } from "@/http/shared/route-types.ts";

export function mapTaggedRouteError<A extends { readonly _tag: string }, I, R>(
  schema: Schema.Schema<A, I, R>,
  map: (error: A) => RouteErrorResponse,
) {
  const isRouteError = Schema.is(schema);

  return (error: unknown): RouteErrorResponse | undefined => {
    if (!isRouteError(error)) {
      return undefined;
    }

    return map(error);
  };
}

export const messageStatus =
  (status: number) =>
  (error: { readonly message: string }): RouteErrorResponse => ({
    message: error.message,
    status,
  });

export function errorStatus(error: { readonly message: string; readonly status: number }) {
  return {
    message: error.message,
    status: error.status,
  } satisfies RouteErrorResponse;
}

export const fixedStatus = (message: string, status: number) => () => ({
  message,
  status,
});
