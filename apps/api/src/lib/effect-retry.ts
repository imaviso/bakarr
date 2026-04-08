import { Effect, Schema } from "effect";

import type { ClockServiceShape } from "@/lib/clock.ts";
import { compactLogAnnotations, durationMsSince, errorLogAnnotations } from "@/lib/logging.ts";

export class ExternalCallError extends Schema.TaggedError<ExternalCallError>()(
  "ExternalCallError",
  {
    cause: Schema.Defect,
    message: Schema.String,
    operation: Schema.String,
  },
) {}

export interface TryExternalEffect {
  <A, E, R>(
    operation: string,
    effect: Effect.Effect<A, E, R>,
    options?: {
      readonly idempotent?: boolean;
      readonly isRetryableError?: (error: ExternalCallError) => boolean;
    },
  ): () => Effect.Effect<A, ExternalCallError, R>;
}

const EXTERNAL_RETRY_DELAYS_MS = [200, 400] as const;

export const makeTryExternal =
  (clock: ClockServiceShape) =>
  <A>(
    operation: string,
    fn: (signal: AbortSignal) => Promise<A>,
    options?: {
      readonly idempotent?: boolean;
      readonly isRetryableError?: (error: ExternalCallError) => boolean;
    },
  ) =>
    makeTryExternalEffect(clock)(
      operation,
      Effect.tryPromise({
        try: fn,
        catch: (cause) => toExternalCallError(operation, cause),
      }),
      options,
    );

export const makeTryExternalEffect =
  (clock: ClockServiceShape) =>
  <A, E, R>(
    operation: string,
    effect: Effect.Effect<A, E, R>,
    options?: {
      readonly idempotent?: boolean;
      readonly isRetryableError?: (error: ExternalCallError) => boolean;
    },
  ) =>
    Effect.fn(`external.${operation}`)(
      function* () {
        const startedAt = yield* clock.currentMonotonicMillis;
        const allowRetry = options?.idempotent !== false;
        const maxAttempts = allowRetry ? EXTERNAL_RETRY_DELAYS_MS.length + 1 : 1;

        const runAttempt = (attemptNumber: number): Effect.Effect<A, ExternalCallError, R> =>
          effect.pipe(
            Effect.timeout("10 seconds"),
            Effect.scoped,
            Effect.mapError((cause) => toExternalCallError(operation, cause)),
            Effect.catchTag("ExternalCallError", (error) => {
              const isRetryable = options?.isRetryableError?.(error) ?? true;
              const retryDelayMs =
                allowRetry && isRetryable ? EXTERNAL_RETRY_DELAYS_MS[attemptNumber - 1] : undefined;

              if (retryDelayMs === undefined) {
                return Effect.fail(error);
              }

              return Effect.logWarning("external call attempt failed; retrying").pipe(
                Effect.annotateLogs(
                  compactLogAnnotations({
                    attempt: attemptNumber,
                    maxAttempts,
                    nextDelayMs: retryDelayMs,
                    ...errorLogAnnotations(error),
                  }),
                ),
                Effect.zipRight(Effect.sleep(`${retryDelayMs} millis`)),
                Effect.zipRight(runAttempt(attemptNumber + 1)),
              );
            }),
          );

        const result = yield* runAttempt(1).pipe(
          Effect.tapBoth({
            onSuccess: () =>
              Effect.gen(function* () {
                const finishedAt = yield* clock.currentMonotonicMillis;
                yield* Effect.logInfo("external call completed").pipe(
                  Effect.annotateLogs({
                    maxAttempts,
                    durationMs: durationMsSince(startedAt, finishedAt),
                  }),
                );
              }),
            onFailure: (error) =>
              Effect.gen(function* () {
                const finishedAt = yield* clock.currentMonotonicMillis;
                yield* Effect.logError("external call failed").pipe(
                  Effect.annotateLogs(
                    compactLogAnnotations({
                      durationMs: durationMsSince(startedAt, finishedAt),
                      maxAttempts,
                      ...errorLogAnnotations(error),
                    }),
                  ),
                );
              }),
          }),
          Effect.withLogSpan(operation),
        );

        return result;
      },
      Effect.annotateLogs({
        component: "external",
        externalOperation: operation,
      }),
    );

function toExternalCallError(operation: string, cause: unknown) {
  return cause instanceof ExternalCallError
    ? cause
    : ExternalCallError.make({
        cause,
        message: `External call failed: ${operation}`,
        operation,
      });
}
