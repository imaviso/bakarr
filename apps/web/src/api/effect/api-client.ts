import { Cause, Effect, Exit, Option, Schema } from "effect";
import { getAuthHeaders } from "~/app/auth-state";
import { API_BASE } from "~/api/constants";

export class ApiClientError extends Schema.TaggedError<ApiClientError>()("ApiClientError", {
  message: Schema.String,
  status: Schema.optional(Schema.Number),
}) {}

export class ApiDecodeError extends Schema.TaggedError<ApiDecodeError>()("ApiDecodeError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export class ApiUnauthorizedError extends Schema.TaggedError<ApiUnauthorizedError>()(
  "ApiUnauthorizedError",
  { message: Schema.String },
) {}

export function isApiUnauthorizedError(error: unknown): error is ApiUnauthorizedError {
  return error instanceof ApiUnauthorizedError;
}

export async function runApiEffect<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) return exit.value;

  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure)) throw failure.value;

  throw Cause.squash(exit.cause);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function apiUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  if (params === undefined) return `${API_BASE}${path}`;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // Preserve 0/false handling: omit only undefined, null-ish empty string, and
    // non-positive media_id (callers previously used `if (mediaId)` check).
    if (value === undefined) continue;
    if (typeof value === "string" && value.length === 0) continue;
    if (key === "media_id" && typeof value === "number" && value <= 0) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query.length > 0 ? `${API_BASE}${path}?${query}` : `${API_BASE}${path}`;
}

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

// Merges request headers with auth headers. authHeadersInit override kept for testability;
// defaults to module-level getAuthHeaders() singleton.
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
      const headers = mergeHeaders(options);

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
        catch: (cause) => {
          if (isAbortError(cause)) {
            throw cause;
          }
          return new ApiClientError({ message: `Network error: ${String(cause)}` });
        },
      });

      if (response.status === 401) {
        const text = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => new ApiClientError({ message: "Unauthorized" }),
        });
        const message = text.length > 0 && text.length <= 200 ? text : "Unauthorized";
        return yield* Effect.fail(new ApiUnauthorizedError({ message }));
      }

      if (!response.ok) {
        const text = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: (cause) => new ApiClientError({ message: String(cause) }),
        });
        const message =
          text.length > 0 && text.length <= 200 ? text : `API error: ${response.status}`;
        return yield* Effect.fail(
          new ApiClientError({
            message,
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
      catch: (cause) => {
        if (isAbortError(cause)) {
          throw cause;
        }
        return new ApiDecodeError({
          message: `Failed to parse JSON: ${String(cause)}`,
          cause,
        });
      },
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
