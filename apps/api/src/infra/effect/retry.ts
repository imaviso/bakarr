// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Cause, Config, Context, Duration, Effect, Layer, Schedule, Schema } from "effect";

import { currentTimeNanos } from "@/infra/time.ts";
import { PositiveIntFromStringSchema } from "@/domain/domain-schema.ts";
import { compactLogAnnotations, errorLogAnnotations } from "@/infra/logging.ts";

export const EXTERNAL_CALL_PROVIDERS: readonly [
  "anilist",
  "jikan",
  "manami",
  "anidb",
  "qbit",
  "rss",
  "seadex",
] = ["anilist", "jikan", "manami", "anidb", "qbit", "rss", "seadex"];

export type ExternalCallProvider = (typeof EXTERNAL_CALL_PROVIDERS)[number];

export class ExternalCallError extends Schema.TaggedError<ExternalCallError>()(
  "ExternalCallError",
  {
    cause: Schema.Defect,
    message: Schema.String,
    operation: Schema.String,
    provider: Schema.optional(Schema.Literal(...EXTERNAL_CALL_PROVIDERS)),
  },
) {}

export interface ExternalCallOptions {
  readonly idempotent?: boolean;
  readonly isRetryableError?: (error: ExternalCallError) => boolean;
  readonly provider?: ExternalCallProvider;
}

const EXTERNAL_RETRY_DELAYS_MS: readonly number[] = [200, 400];
const DEFAULT_EXTERNAL_CALL_CONCURRENCY = 8;
const DEFAULT_MEDIA_EXTERNAL_CALL_CONCURRENCY = 4;
const DEFAULT_QBIT_EXTERNAL_CALL_CONCURRENCY = 2;
const DEFAULT_EXTERNAL_CALL_TIMEOUT = "10 seconds";

type ExternalCallPool = "default" | "media" | "qbit";

export interface ExternalCallPolicyShape {
  readonly retryDelaysMs: readonly number[];
  readonly timeout: Duration.DurationInput;
  readonly resolvePool: (operation: string, provider?: ExternalCallProvider) => ExternalCallPool;
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

function resolveExternalCallPool(
  operation: string,
  provider?: ExternalCallProvider,
): ExternalCallPool {
  if (provider !== undefined) {
    if (provider === "qbit") {
      return "qbit";
    }

    if (
      provider === "anilist" ||
      provider === "jikan" ||
      provider === "manami" ||
      provider === "anidb"
    ) {
      return "media";
    }

    return "default";
  }

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
    } satisfies Record<ExternalCallPool, Effect.Semaphore>;

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
        const allowRetry = options?.idempotent !== false;
        const isRetryable = options?.isRetryableError ?? (() => true);
        const maxAttempts = allowRetry ? policy.retryDelaysMs.length + 1 : 1;
        const pool = policy.resolvePool(operation, options?.provider);

        const performAttempt = semaphores.withPermits(
          pool,
          effect.pipe(
            Effect.timeout(policy.timeout),
            Effect.scoped,
            Effect.mapError((cause) => toExternalCallError(operation, cause, options?.provider)),
          ),
        );

        const retrySchedule = Schedule.recurs(policy.retryDelaysMs.length).pipe(
          Schedule.addDelay((retryCount) => policy.retryDelaysMs[retryCount] ?? 0),
          // `retryCount` is 0-based, so this attempt is `retryCount + 1`.
          Schedule.checkEffect((error: ExternalCallError, retryCount: number) =>
            Effect.gen(function* () {
              if (!allowRetry || retryCount + 1 >= maxAttempts || !isRetryable(error)) {
                return false;
              }

              yield* Effect.logWarning("external call attempt failed; retrying").pipe(
                Effect.annotateLogs(
                  compactLogAnnotations({
                    attempt: retryCount + 1,
                    maxAttempts,
                    nextDelayMs: policy.retryDelaysMs[retryCount] ?? 0,
                    ...errorLogAnnotations(error),
                  }),
                ),
              );

              return true;
            }),
          ),
        );

        const [duration, exit] = yield* performAttempt.pipe(
          Effect.retry(retrySchedule),
          Effect.exit,
          Effect.timedWith(currentTimeNanos),
        );

        if (exit._tag === "Success") {
          yield* Effect.logDebug("external call completed").pipe(
            Effect.annotateLogs({
              durationMs: Duration.toMillis(duration),
              maxAttempts,
            }),
          );
          return exit.value;
        }

        yield* Effect.logError("external call failed").pipe(
          Effect.annotateLogs(
            compactLogAnnotations({
              durationMs: Duration.toMillis(duration),
              maxAttempts,
              ...errorLogAnnotations(Cause.squash(exit.cause)),
            }),
          ),
        );
        return yield* Effect.failCause(exit.cause);
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

// Unset keys fall back to the default; an *invalid* value (non-integer, zero,
// negative) is an unrecoverable startup failure and dies during layer
// construction instead of being silently ignored. The defect carries the
// config key so operator sees which env var is bad without digging.
const readExternalConcurrency = (key: string, fallback: number) =>
  Effect.gen(function* () {
    return yield* Schema.Config(key, PositiveIntFromStringSchema).pipe(
      Config.withDefault(fallback),
      Effect.orDieWith(
        (cause) => new Error(`Invalid ${key}: ${String(cause)} (expected positive integer)`),
      ),
    );
  });

function toExternalCallError(operation: string, cause: unknown, provider?: ExternalCallProvider) {
  return cause instanceof ExternalCallError
    ? cause
    : ExternalCallError.make({
        cause,
        message: `External call failed: ${operation}`,
        operation,
        ...(provider === undefined ? {} : { provider }),
      });
}
