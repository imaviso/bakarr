import { Data, Effect, Schema } from "effect";
import { getAuthHeaders, logout } from "~/lib/auth";

export class ApiClientError extends Data.TaggedError("ApiClientError")<{
  readonly message: string;
  readonly status?: number;
}> {}

export class ApiDecodeError extends Data.TaggedError("ApiDecodeError")<{
  readonly message: string;
}> {}

export class ApiUnauthorizedError extends Data.TaggedError("ApiUnauthorizedError")<{
  readonly message: string;
}> {}

export interface ApiRequestOptions extends RequestInit {
  readonly skipAutoLogoutOnUnauthorized?: boolean;
}

export const fetchResponse = Effect.fn("ApiClient.fetchResponse")(
  (
    endpoint: string,
    options?: ApiRequestOptions,
    signal?: AbortSignal,
  ): Effect.Effect<Response, ApiClientError | ApiUnauthorizedError> =>
    Effect.tryPromise({
      try: async () => {
        const headers = new Headers(options?.headers);
        const authHeaders = new Headers(getAuthHeaders());
        for (const [key, value] of authHeaders.entries()) {
          headers.set(key, value);
        }

        if (!headers.has("Content-Type") && options?.body !== undefined) {
          headers.set("Content-Type", "application/json");
        }

        const requestInit: RequestInit = {
          ...options,
          headers,
          credentials: "include",
          ...(signal === undefined ? {} : { signal }),
        };

        const res = await fetch(endpoint, requestInit);

        if (res.status === 401 && !options?.skipAutoLogoutOnUnauthorized) {
          void logout();
          throw new ApiUnauthorizedError({ message: "Session expired" });
        }

        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          throw new ApiClientError({
            message: errorText || `API error: ${res.status}`,
            status: res.status,
          });
        }

        return res;
      },
      catch: (cause) => {
        if (cause instanceof ApiUnauthorizedError) return cause;
        if (cause instanceof ApiClientError) return cause;
        return new ApiClientError({ message: `Network error: ${String(cause)}` });
      },
    }),
);

const ApiResultSchema = Schema.Struct({
  success: Schema.Boolean,
  data: Schema.Unknown,
  error: Schema.optional(Schema.String),
});

export const fetchJson = Effect.fn("ApiClient.fetchJson")(
  <A>(
    endpoint: string,
    options?: ApiRequestOptions,
    signal?: AbortSignal,
  ): Effect.Effect<A, ApiClientError | ApiDecodeError | ApiUnauthorizedError> =>
    fetchResponse(endpoint, options, signal).pipe(
      Effect.flatMap((res) =>
        Effect.tryPromise({
          try: () => res.json(),
          catch: (cause) =>
            new ApiDecodeError({
              message: `Failed to parse JSON: ${String(cause)}`,
            }),
        }),
      ),
      Effect.flatMap((json: unknown) => {
        const result = Schema.decodeUnknownEither(ApiResultSchema)(json);
        if (result._tag === "Right") {
          if (!result.right.success) {
            return Effect.fail(
              new ApiClientError({
                message: result.right.error || "Unknown API error",
              }),
            );
          }
          // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
          return Effect.succeed(result.right.data as A);
        }
        // Not a wrapped response; return raw JSON
        // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
        return Effect.succeed(json as A);
      }),
    ),
);
