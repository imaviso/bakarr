import { Effect, Schedule, Schema } from "effect";

import {
  compactLogAnnotations,
  durationMsSince,
  errorLogAnnotations,
} from "./logging.ts";

export class ExternalCallError extends Schema.TaggedError<ExternalCallError>()(
  "ExternalCallError",
  {
    cause: Schema.Defect,
    message: Schema.String,
    operation: Schema.String,
  },
) {}

const retryPolicy = Schedule.exponential("200 millis").pipe(
  Schedule.compose(Schedule.recurs(2)),
);

const noRetryPolicy = Schedule.recurs(0);

export const tryExternal = <A>(
  operation: string,
  fn: (signal: AbortSignal) => Promise<A>,
  options?: { readonly idempotent?: boolean },
) =>
  Effect.fn(`external.${operation}`)(
    function* () {
      const startedAt = performance.now();
      const policy = options?.idempotent === false
        ? noRetryPolicy
        : retryPolicy;

      const result = yield* Effect.tryPromise({
        try: (signal) => fn(signal),
        catch: (cause) => toExternalCallError(operation, cause),
      }).pipe(
        Effect.timeout("10 seconds"),
        Effect.retry(policy),
        Effect.scoped,
        Effect.mapError((cause) => toExternalCallError(operation, cause)),
        Effect.tapBoth({
          onSuccess: () =>
            Effect.logInfo("external call completed").pipe(
              Effect.annotateLogs({
                durationMs: durationMsSince(startedAt),
              }),
            ),
          onFailure: (error) =>
            Effect.logError("external call failed").pipe(
              Effect.annotateLogs(
                compactLogAnnotations({
                  durationMs: durationMsSince(startedAt),
                  ...errorLogAnnotations(error),
                }),
              ),
            ),
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

export const tryExternalEffect = <A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
  options?: { readonly idempotent?: boolean },
) =>
  Effect.fn(`external.${operation}`)(
    function* () {
      const startedAt = performance.now();
      const policy = options?.idempotent === false
        ? noRetryPolicy
        : retryPolicy;

      const result = yield* effect.pipe(
        Effect.timeout("10 seconds"),
        Effect.retry(policy),
        Effect.scoped,
        Effect.mapError((cause) => toExternalCallError(operation, cause)),
        Effect.tapBoth({
          onSuccess: () =>
            Effect.logInfo("external call completed").pipe(
              Effect.annotateLogs({
                durationMs: durationMsSince(startedAt),
              }),
            ),
          onFailure: (error) =>
            Effect.logError("external call failed").pipe(
              Effect.annotateLogs(
                compactLogAnnotations({
                  durationMs: durationMsSince(startedAt),
                  ...errorLogAnnotations(error),
                }),
              ),
            ),
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
  return cause instanceof ExternalCallError ? cause : ExternalCallError.make({
    cause,
    message: `External call failed: ${operation}`,
    operation,
  });
}
