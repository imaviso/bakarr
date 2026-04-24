import { Effect } from "effect";
import { fetchJson, fetchResponse, type ApiRequestOptions } from "~/lib/effect/api-client";

export const API_BASE = "/api";

export async function fetchApiResponse(
  endpoint: string,
  options?: ApiRequestOptions,
  signal?: AbortSignal,
): Promise<Response> {
  return Effect.runPromise(fetchResponse(endpoint, options, signal));
}

export async function fetchApi<T>(
  endpoint: string,
  options?: ApiRequestOptions,
  signal?: AbortSignal,
): Promise<T> {
  return Effect.runPromise(fetchJson<T>(endpoint, options, signal));
}
