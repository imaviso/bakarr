import { Data, Effect, Schema } from "effect";
import { getAuthHeaders } from "~/app/auth-state";

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

export interface ApiRequestOptions {
  readonly method?: string;
  readonly headers?: HeadersInit;
  readonly body?: unknown;
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  );
}

function serializeBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (isBodyInit(body)) return body;
  return JSON.stringify(body);
}

export function mergeHeaders(options?: ApiRequestOptions, authHeadersInit?: HeadersInit): Headers {
  const headers = new Headers(options?.headers);
  const authHeaders = new Headers(authHeadersInit ?? getAuthHeaders());
  for (const [key, value] of authHeaders.entries()) {
    headers.set(key, value);
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
      const body = serializeBody(options?.body);
      const headers = mergeHeaders(options, getAuthHeaders());

      if (
        body !== undefined &&
        !headers.has("Content-Type") &&
        !(body instanceof FormData) &&
        !(body instanceof URLSearchParams) &&
        typeof body === "string"
      ) {
        headers.set("Content-Type", "application/json");
      }

      const response = yield* Effect.tryPromise({
        try: () => {
          const init: RequestInit = {
            headers,
            credentials: "include",
          };
          if (options?.method !== undefined) {
            init.method = options.method;
          }
          if (body !== undefined) {
            init.body = body;
          }
          if (signal !== undefined) {
            init.signal = signal;
          }
          return fetch(endpoint, init);
        },
        catch: (cause) => new ApiClientError({ message: `Network error: ${String(cause)}` }),
      });

      if (response.status === 401) {
        const text = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => new ApiClientError({ message: "Unauthorized" }),
        });
        return yield* Effect.fail(new ApiUnauthorizedError({ message: text || "Unauthorized" }));
      }

      if (!response.ok) {
        const text = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: (cause) => new ApiClientError({ message: String(cause) }),
        });
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
  });

export const fetchUnit = (
  endpoint: string,
  options?: ApiRequestOptions,
  signal?: AbortSignal,
): Effect.Effect<void, ApiClientError | ApiUnauthorizedError> =>
  fetchResponse(endpoint, options, signal).pipe(Effect.asVoid);
