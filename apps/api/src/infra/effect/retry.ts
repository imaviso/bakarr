import { Context, Either, Effect, Layer, Schema } from "effect";

import { ClockService } from "@/infra/clock.ts";
import { PositiveIntFromStringSchema } from "@/domain/domain-schema.ts";
import { compactLogAnnotations, durationMsSince, errorLogAnnotations } from "@/infra/logging.ts";

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
const DEFAULT_EXTERNAL_CALL_CONCURRENCY = 8;
const DEFAULT_MEDIA_EXTERNAL_CALL_CONCURRENCY = 4;
const DEFAULT_QBIT_EXTERNAL_CALL_CONCURRENCY = 2;

export interface ExternalCallTuningOverrides {
  readonly defaultConcurrency?: number;
  readonly mediaConcurrency?: number;
  readonly qbitConcurrency?: number;
}

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

type ExternalCallPool = "default" | "media" | "qbit";

export const makeExternalCall = Effect.fn("ExternalCall.makeExternalCall")(function* (
  overrides: ExternalCallTuningOverrides = {},
) {
  const clock = yield* ClockService;
  const defaultConcurrency =
    overrides.defaultConcurrency ??
    (yield* readExternalConcurrency(
      "BAKARR_EXTERNAL_CALL_CONCURRENCY",
      DEFAULT_EXTERNAL_CALL_CONCURRENCY,
    ));
  const mediaConcurrency =
    overrides.mediaConcurrency ??
    (yield* readExternalConcurrency(
      "BAKARR_EXTERNAL_CALL_MEDIA_CONCURRENCY",
      DEFAULT_MEDIA_EXTERNAL_CALL_CONCURRENCY,
    ));
  const qbitConcurrency =
    overrides.qbitConcurrency ??
    (yield* readExternalConcurrency(
      "BAKARR_EXTERNAL_CALL_QBIT_CONCURRENCY",
      DEFAULT_QBIT_EXTERNAL_CALL_CONCURRENCY,
    ));

  const semaphores = {
    default: yield* Effect.makeSemaphore(defaultConcurrency),
    media: yield* Effect.makeSemaphore(mediaConcurrency),
    qbit: yield* Effect.makeSemaphore(qbitConcurrency),
  } as const;

  const resolveSemaphore = (operation: string) => semaphores[resolveExternalCallPool(operation)];

  const tryExternalEffect = Effect.fn("ExternalCall.tryExternalEffect")(function* <A, E, R>(
    operation: string,
    effect: Effect.Effect<A, E, R>,
    options?: ExternalCallOptions,
  ) {
    const allowRetry = options?.idempotent !== false;
    const isRetryable = options?.isRetryableError ?? (() => true);
    const maxAttempts = allowRetry ? EXTERNAL_RETRY_DELAYS_MS.length + 1 : 1;

    return yield* Effect.gen(function* () {
      const startedAt = yield* clock.currentMonotonicMillis;
      const semaphore = resolveSemaphore(operation);
      let attemptNumber = 1;

      while (true) {
        const attemptResult = yield* Effect.either(
          semaphore.withPermits(1)(
            effect.pipe(
              Effect.timeout("10 seconds"),
              Effect.scoped,
              Effect.mapError((cause) => toExternalCallError(operation, cause)),
            ),
          ),
        );

        if (Either.isRight(attemptResult)) {
          const finishedAt = yield* clock.currentMonotonicMillis;
          yield* Effect.logInfo("external call completed").pipe(
            Effect.annotateLogs({
              durationMs: durationMsSince(startedAt, finishedAt),
              maxAttempts,
              attemptsUsed: attemptNumber,
            }),
          );

          return attemptResult.right;
        }

        const error = attemptResult.left;

        if (!allowRetry || attemptNumber >= maxAttempts || !isRetryable(error)) {
          const finishedAt = yield* clock.currentMonotonicMillis;
          yield* Effect.logError("external call failed").pipe(
            Effect.annotateLogs(
              compactLogAnnotations({
                durationMs: durationMsSince(startedAt, finishedAt),
                maxAttempts,
                attemptsUsed: attemptNumber,
                ...errorLogAnnotations(error),
              }),
            ),
          );

          return yield* error;
        }

        const retryDelayMs = EXTERNAL_RETRY_DELAYS_MS[attemptNumber - 1]!;
        yield* Effect.logWarning("external call attempt failed; retrying").pipe(
          Effect.annotateLogs(
            compactLogAnnotations({
              attempt: attemptNumber,
              maxAttempts,
              nextDelayMs: retryDelayMs,
              ...errorLogAnnotations(error),
            }),
          ),
        );

        yield* Effect.sleep(retryDelayMs);
        attemptNumber += 1;
      }
    }).pipe(
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
  } satisfies ExternalCallShape;
});

export const ExternalCallLive = Layer.effect(ExternalCall, makeExternalCall());

const readExternalConcurrency = (key: string, fallback: number) =>
  Schema.Config(key, PositiveIntFromStringSchema).pipe(
    Effect.catchAll(() => Effect.succeed(fallback)),
  );

const resolveExternalCallPool = (operation: string): ExternalCallPool => {
  if (operation.startsWith("qbit.")) {
    return "qbit";
  }

  if (
    operation.startsWith("jikan.") ||
    operation.startsWith("anilist.") ||
    operation.startsWith("manami.") ||
    operation.startsWith("anidb.")
  ) {
    return "media";
  }

  return "default";
};

function toExternalCallError(operation: string, cause: unknown) {
  return cause instanceof ExternalCallError
    ? cause
    : ExternalCallError.make({
        cause,
        message: `External call failed: ${operation}`,
        operation,
      });
}
