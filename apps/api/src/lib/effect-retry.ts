import { Effect, Schedule, Schema } from "effect";

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

const retryPolicy = Schedule.exponential("200 millis").pipe(Schedule.compose(Schedule.recurs(2)));

const noRetryPolicy = Schedule.recurs(0);

export const makeTryExternal =
  (clock: ClockServiceShape) =>
  <A>(
    operation: string,
    fn: (signal: AbortSignal) => Promise<A>,
    options?: { readonly idempotent?: boolean },
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
    options?: { readonly idempotent?: boolean },
  ) =>
    Effect.fn(`external.${operation}`)(
      function* () {
        const startedAt = yield* clock.currentMonotonicMillis;
        const policy = options?.idempotent === false ? noRetryPolicy : retryPolicy;

        const result = yield* effect.pipe(
          Effect.timeout("10 seconds"),
          Effect.retry(policy),
          Effect.scoped,
          Effect.mapError((cause) => toExternalCallError(operation, cause)),
          Effect.tapBoth({
            onSuccess: () =>
              Effect.gen(function* () {
                const finishedAt = yield* clock.currentMonotonicMillis;
                yield* Effect.logInfo("external call completed").pipe(
                  Effect.annotateLogs({
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
