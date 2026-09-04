import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { Effect, Schema } from "effect";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { ExternalCallError, type ExternalCallShape } from "@/infra/effect/retry.ts";

export interface ProviderHttpRequestInput {
  readonly client: HttpClient.HttpClient;
  readonly externalCall: ExternalCallShape;
  /** Human-facing label used in error messages, e.g. `AniList search`. */
  readonly failureMessage: string;
  readonly operation: string;
  readonly request: HttpClientRequest.HttpClientRequest;
  /**
   * Statuses that should be returned to the caller instead of failing.
   * Defaults to the 2xx range. Use it for meaningful statuses such as
   * 304 (not modified) or 404 (missing); anything else fails with a
   * retryable `ExternalCallError` so 429/5xx responses hit the retry
   * schedule inside `tryExternalEffect`.
   */
  readonly isExpectedStatus?: (status: number) => boolean;
}

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

export const executeProviderRequest = (
  input: ProviderHttpRequestInput,
): Effect.Effect<HttpClientResponse.HttpClientResponse, ExternalCallError> =>
  input.externalCall.tryExternalEffect(
    input.operation,
    Effect.gen(function* () {
      const response = yield* input.client.execute(input.request);
      const isExpected = input.isExpectedStatus ?? isSuccessStatus;

      if (!isExpected(response.status)) {
        return yield* ExternalCallError.make({
          cause: new Error(`${input.failureMessage} failed with status ${response.status}`),
          message: `${input.failureMessage} failed`,
          operation: `${input.operation}.response`,
        });
      }

      return response;
    }),
    {
      // Transport failures keep `operation`; status failures use
      // `${operation}.response`. Decode failures (`${operation}.json`) are
      // deterministic payload problems and must not burn retry attempts.
      isRetryableError: (error) =>
        error.operation === input.operation || error.operation === `${input.operation}.response`,
    },
  );

export interface ProviderJsonCallInput<A, I> extends ProviderHttpRequestInput {
  readonly schema: Schema.Codec<A, I, never, unknown>;
}

export const callProviderJson = <A, I>(
  input: ProviderJsonCallInput<A, I>,
): Effect.Effect<A, ExternalCallError> =>
  executeProviderRequest(input).pipe(
    Effect.flatMap((response) =>
      HttpClientResponse.schemaBodyJson(input.schema)(response).pipe(
        Effect.mapError((cause) =>
          ExternalCallError.make({
            cause,
            message: `${input.failureMessage} response decode failed`,
            operation: `${input.operation}.json`,
          }),
        ),
      ),
    ),
  );
