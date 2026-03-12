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

export const tryExternal = <A>(
  operation: string,
  fn: (signal: AbortSignal) => Promise<A>,
) =>
  Effect.fn(`external.${operation}`)(
    function* () {
      const startedAt = performance.now();

      try {
        const result = yield* Effect.tryPromise({
          try: (signal) => fn(signal),
          catch: (cause) => toExternalCallError(operation, cause),
        }).pipe(
          Effect.timeout("10 seconds"),
          Effect.retry(retryPolicy),
          Effect.scoped,
          Effect.withLogSpan(operation),
        );

        yield* Effect.logInfo("external call completed").pipe(
          Effect.annotateLogs({
            durationMs: durationMsSince(startedAt),
          }),
        );

        return result;
      } catch (error) {
        const wrapped = toExternalCallError(operation, error);

        yield* Effect.logError("external call failed").pipe(
          Effect.annotateLogs(
            compactLogAnnotations({
              durationMs: durationMsSince(startedAt),
              ...errorLogAnnotations(wrapped),
            }),
          ),
        );

        return yield* Effect.fail(wrapped);
      }
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
