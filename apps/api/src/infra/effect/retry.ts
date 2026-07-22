import { Cause, Context, Duration, Effect, Layer, Ref, Schedule, Schema } from "effect";

import { currentTimeNanos } from "@/infra/time.ts";
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
const DEFAULT_EXTERNAL_CALL_TIMEOUT = "10 seconds";

type ExternalCallPool = "default" | "media" | "qbit";

export interface ExternalCallPolicyShape {
  readonly retryDelaysMs: readonly number[];
  readonly timeout: Duration.DurationInput;
  readonly resolvePool: (operation: string) => ExternalCallPool;
}

export interface ExternalCallSemaphoresShape {
  readonly withPermits: <A, E, R>(
    pool: ExternalCallPool,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
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

function resolveExternalCallPool(operation: string): ExternalCallPool {
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
}

export class ExternalCallPolicy extends Effect.Service<ExternalCallPolicy>()(
  "@bakarr/api/ExternalCallPolicy",
  {
    sync: () =>
      ({
        resolvePool: resolveExternalCallPool,
        retryDelaysMs: EXTERNAL_RETRY_DELAYS_MS,
        timeout: DEFAULT_EXTERNAL_CALL_TIMEOUT,
      }) satisfies ExternalCallPolicyShape,
  },
) {}

export const makeExternalCallSemaphores = Effect.fn("ExternalCall.makeExternalCallSemaphores")(
  function* () {
    const defaultConcurrency = yield* readExternalConcurrency(
      "BAKARR_EXTERNAL_CALL_CONCURRENCY",
      DEFAULT_EXTERNAL_CALL_CONCURRENCY,
    );
    const mediaConcurrency = yield* readExternalConcurrency(
      "BAKARR_EXTERNAL_CALL_MEDIA_CONCURRENCY",
      DEFAULT_MEDIA_EXTERNAL_CALL_CONCURRENCY,
    );
    const qbitConcurrency = yield* readExternalConcurrency(
      "BAKARR_EXTERNAL_CALL_QBIT_CONCURRENCY",
      DEFAULT_QBIT_EXTERNAL_CALL_CONCURRENCY,
    );

    const semaphores = {
      default: yield* Effect.makeSemaphore(defaultConcurrency),
      media: yield* Effect.makeSemaphore(mediaConcurrency),
      qbit: yield* Effect.makeSemaphore(qbitConcurrency),
    } as const;

    return {
      withPermits: <A, E, R>(pool: ExternalCallPool, effect: Effect.Effect<A, E, R>) =>
        semaphores[pool].withPermits(1)(effect),
    } satisfies ExternalCallSemaphoresShape;
  },
);

export class ExternalCallSemaphores extends Effect.Service<ExternalCallSemaphores>()(
  "@bakarr/api/ExternalCallSemaphores",
  {
    scoped: makeExternalCallSemaphores(),
  },
) {}

export const makeExternalCall = Effect.fn("ExternalCall.makeExternalCall")(function* () {
  const policy = yield* ExternalCallPolicy;
  const semaphores = yield* ExternalCallSemaphores;

  const tryExternalEffect = Effect.fn("ExternalCall.tryExternalEffect")(
    <A, E, R>(operation: string, effect: Effect.Effect<A, E, R>, options?: ExternalCallOptions) =>
      Effect.gen(function* () {
        const startedAt = yield* currentTimeNanos;
        const attemptsUsedRef = yield* Ref.make(0);
        const allowRetry = options?.idempotent !== false;
        const isRetryable = options?.isRetryableError ?? (() => true);
        const maxAttempts = allowRetry ? policy.retryDelaysMs.length + 1 : 1;
        const pool = policy.resolvePool(operation);

        const performAttempt = Effect.gen(function* () {
          yield* Ref.update(attemptsUsedRef, (attemptsUsed) => attemptsUsed + 1);

          return yield* semaphores.withPermits(
            pool,
            effect.pipe(
              Effect.timeout(policy.timeout),
              Effect.scoped,
              Effect.mapError((cause) => toExternalCallError(operation, cause)),
            ),
          );
        });

        const retrySchedule = Schedule.recurs(policy.retryDelaysMs.length).pipe(
          Schedule.addDelay((retryCount) => policy.retryDelaysMs[retryCount] ?? 0),
          Schedule.checkEffect((error: ExternalCallError) =>
            Effect.gen(function* () {
              const attemptsUsed = yield* Ref.get(attemptsUsedRef);

              if (!allowRetry || attemptsUsed >= maxAttempts || !isRetryable(error)) {
                return false;
              }

              const retryDelayMs = policy.retryDelaysMs[attemptsUsed - 1] ?? 0;
              yield* Effect.logWarning("external call attempt failed; retrying").pipe(
                Effect.annotateLogs(
                  compactLogAnnotations({
                    attempt: attemptsUsed,
                    maxAttempts,
                    nextDelayMs: retryDelayMs,
                    ...errorLogAnnotations(error),
                  }),
                ),
              );

              return true;
            }),
          ),
        );

        return yield* performAttempt.pipe(
          Effect.retry(retrySchedule),
          Effect.tap(() =>
            Ref.get(attemptsUsedRef).pipe(
              Effect.flatMap((attemptsUsed) =>
                currentTimeNanos.pipe(
                  Effect.flatMap((finishedAt) =>
                    Effect.logDebug("external call completed").pipe(
                      Effect.annotateLogs({
                        durationMs: durationMsSince(startedAt, finishedAt),
                        maxAttempts,
                        attemptsUsed,
                      }),
                    ),
                  ),
                ),
              ),
            ),
          ),
          Effect.tapErrorCause((cause) =>
            Ref.get(attemptsUsedRef).pipe(
              Effect.flatMap((attemptsUsed) =>
                currentTimeNanos.pipe(
                  Effect.flatMap((finishedAt) =>
                    Effect.logError("external call failed").pipe(
                      Effect.annotateLogs(
                        compactLogAnnotations({
                          durationMs: durationMsSince(startedAt, finishedAt),
                          maxAttempts,
                          attemptsUsed,
                          ...errorLogAnnotations(Cause.squash(cause)),
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      }),
  );

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

  const service: ExternalCallShape = {
    tryExternal,
    tryExternalEffect,
  };
  return service;
});

export const ExternalCallLive = Layer.effect(ExternalCall, makeExternalCall()).pipe(
  Layer.provide(Layer.mergeAll(ExternalCallPolicy.Default, ExternalCallSemaphores.Default)),
);

const readExternalConcurrency = (key: string, fallback: number) =>
  Schema.Config(key, PositiveIntFromStringSchema).pipe(
    Effect.catchAll(() => Effect.succeed(fallback)),
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
