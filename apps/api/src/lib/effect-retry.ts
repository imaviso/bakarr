import { Context, Effect, Layer, Schema } from "effect";

import { ClockService, type ClockServiceShape } from "@/lib/clock.ts";
import { compactLogAnnotations, durationMsSince, errorLogAnnotations } from "@/lib/logging.ts";

export class ExternalCallError extends Schema.TaggedError<ExternalCallError>()(
  "ExternalCallError",
  {
    cause: Schema.Defect,
    message: Schema.String,
    operation: Schema.String,
  },
) {}

export interface ExternalCallOptions {
  readonly idempotent?: boolean;
  readonly isRetryableError?: (error: ExternalCallError) => boolean;
}

const EXTERNAL_RETRY_DELAYS_MS = [200, 400] as const;

export interface ExternalCallShape {
  readonly tryExternal: <A>(
    operation: string,
    fn: (signal: AbortSignal) => Promise<A>,
    options?: ExternalCallOptions,
  ) => Effect.Effect<A, ExternalCallError>;
  readonly tryExternalEffect: <A, E, R>(
    operation: string,
    effect: Effect.Effect<A, E, R>,
    options?: ExternalCallOptions,
  ) => Effect.Effect<A, ExternalCallError, R>;
}

export class ExternalCall extends Context.Tag("@bakarr/api/ExternalCall")<
  ExternalCall,
  ExternalCallShape
>() {}

export function makeExternalCall(clock: ClockServiceShape): ExternalCallShape {
  const tryExternalEffect = Effect.fn("ExternalCall.tryExternalEffect")(function* <A, E, R>(
    operation: string,
    effect: Effect.Effect<A, E, R>,
    options?: ExternalCallOptions,
  ) {
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

    return yield* runAttempt(1).pipe(
      Effect.tapBoth({
        onSuccess: () =>
          Effect.gen(function* () {
            const finishedAt = yield* clock.currentMonotonicMillis;
            yield* Effect.logInfo("external call completed").pipe(
              Effect.annotateLogs({
                durationMs: durationMsSince(startedAt, finishedAt),
                maxAttempts,
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
      Effect.annotateLogs({
        component: "external",
        externalOperation: operation,
      }),
    );
  });

  const tryExternal = Effect.fn("ExternalCall.tryExternal")(function* <A>(
    operation: string,
    fn: (signal: AbortSignal) => Promise<A>,
    options?: ExternalCallOptions,
  ) {
    return yield* tryExternalEffect(
      operation,
      Effect.tryPromise({
        try: fn,
        catch: (cause) => toExternalCallError(operation, cause),
      }),
      options,
    );
  });

  return {
    tryExternal,
    tryExternalEffect,
  };
}

export const ExternalCallLive = Layer.effect(
  ExternalCall,
  Effect.gen(function* () {
    const clock = yield* ClockService;
    return makeExternalCall(clock);
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
