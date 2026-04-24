import { Data, Effect, Schema } from "effect";
import { getAuthHeaders, logout } from "~/lib/auth";

export class ApiClientError extends Data.TaggedError("ApiClientError")<{
  readonly message: string;
  readonly status?: number;
}> {}

export class ApiDecodeError extends Data.TaggedError("ApiDecodeError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ApiUnauthorizedError extends Data.TaggedError("ApiUnauthorizedError")<{
  readonly message: string;
}> {}

export interface ApiRequestOptions extends RequestInit {
  readonly skipAutoLogoutOnUnauthorized?: boolean;
}

function mergeHeaders(options?: ApiRequestOptions): Headers {
  const headers = new Headers(options?.headers);
  const authHeaders = new Headers(getAuthHeaders());
  for (const [key, value] of authHeaders.entries()) {
    headers.set(key, value);
  }
  if (!headers.has("Content-Type") && options?.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

export const fetchResponse = Effect.fn("ApiClient.fetchResponse")(
  (
    endpoint: string,
    options?: ApiRequestOptions,
    signal?: AbortSignal,
  ): Effect.Effect<Response, ApiClientError | ApiUnauthorizedError> =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(endpoint, {
            ...options,
            headers: mergeHeaders(options),
            credentials: "include",
            ...(signal === undefined ? {} : { signal }),
          }),
        catch: (cause) => new ApiClientError({ message: `Network error: ${String(cause)}` }),
      });

      if (response.status === 401 && !options?.skipAutoLogoutOnUnauthorized) {
        void logout();
        return yield* Effect.fail(new ApiUnauthorizedError({ message: "Session expired" }));
      }

      if (!response.ok) {
        const text = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: (cause) => new ApiClientError({ message: String(cause) }),
        }).pipe(Effect.orElseSucceed(() => ""));
        return yield* Effect.fail(
          new ApiClientError({
            message: text || `API error: ${response.status}`,
            status: response.status,
          }),
        );
      }

      return response;
    }),
);

export const fetchJson = <A, I>(
  schema: Schema.Schema<A, I>,
  endpoint: string,
  options?: ApiRequestOptions,
  signal?: AbortSignal,
): Effect.Effect<A, ApiClientError | ApiDecodeError | ApiUnauthorizedError> =>
  Effect.gen(function* () {
    const response = yield* fetchResponse(endpoint, options, signal);
    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) =>
        new ApiDecodeError({
          message: `Failed to parse JSON: ${String(cause)}`,
          cause,
        }),
    });

    return yield* Schema.decodeUnknown(schema)(json).pipe(
      Effect.mapError(
        (cause) => new ApiDecodeError({ message: "Schema validation failed", cause }),
      ),
    );
  }).pipe(Effect.withSpan("ApiClient.fetchJson"));

export const fetchUnit = (
  endpoint: string,
  options?: ApiRequestOptions,
  signal?: AbortSignal,
): Effect.Effect<void, ApiClientError | ApiUnauthorizedError> =>
  fetchResponse(endpoint, options, signal).pipe(Effect.asVoid);
