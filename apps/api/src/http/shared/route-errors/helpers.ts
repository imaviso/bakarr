import type { RouteErrorResponse } from "@/http/shared/route-types.ts";

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
