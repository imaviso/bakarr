import { Cause, Context, Effect, Layer, LogLevel, Logger, Option, Record, Ref } from "effect";
// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)

export function compactLogAnnotations(
  annotations: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(annotations).filter(([, value]) => value !== undefined));
}

export function errorLogAnnotations(error: unknown): Record<string, unknown> {
  if (error === undefined || error === null) {
    return {};
  }

  if (error instanceof Error) {
    return compactLogAnnotations({
      errorCause: formatUnknown(error.cause),
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
    });
  }

  return compactLogAnnotations({
    errorMessage: formatUnknown(error),
    errorType: typeof error,
  });
}

const LOG_LEVELS: Record<"debug" | "error" | "info" | "trace" | "warn", LogLevel.LogLevel> = {
  debug: "Debug",
  error: "Error",
  info: "Info",
  trace: "Trace",
  warn: "Warn",
};

const LOG_LEVEL_ALIASES: Record<string, LogLevel.LogLevel> = {
  debug: LOG_LEVELS.debug,
  error: LOG_LEVELS.error,
  info: LOG_LEVELS.info,
  trace: LOG_LEVELS.trace,
  warn: LOG_LEVELS.warn,
  warning: LOG_LEVELS.warn,
};

export interface RuntimeLogLevelStateShape {
  readonly get: Effect.Effect<LogLevel.LogLevel>;
  readonly set: (level: string | undefined) => Effect.Effect<void>;
}

export interface RuntimeLogSinkShape {
  readonly write: (input: {
    readonly level: LogLevel.LogLevel;
    readonly line: string;
  }) => Effect.Effect<void>;
}

export class RuntimeLogLevelState extends Context.Service<
  RuntimeLogLevelState,
  RuntimeLogLevelStateShape
>()("@bakarr/api/RuntimeLogLevelState") {
  static readonly layer = Layer.effect(
    RuntimeLogLevelState,
    Effect.gen(function* () {
      const ref = yield* Ref.make<LogLevel.LogLevel>("Info");

      return {
        get: Ref.get(ref),
        set: (level) => Ref.set(ref, parseRuntimeLogLevel(level)),
      } satisfies RuntimeLogLevelStateShape;
    }),
  );
}

export class RuntimeLogSink extends Context.Service<RuntimeLogSink, RuntimeLogSinkShape>()(
  "@bakarr/api/RuntimeLogSink",
) {
  static readonly layer = Layer.succeed(RuntimeLogSink, {
    write: ({ level, line }) =>
      Effect.sync(() => {
        if (LogLevel.getOrdinal(level) >= LogLevel.getOrdinal("Error")) {
          console.error(line);
          return;
        }

        if (LogLevel.getOrdinal(level) >= LogLevel.getOrdinal("Warn")) {
          console.warn(line);
          return;
        }

        console.log(line);
      }),
  } satisfies RuntimeLogSinkShape);
}

export const RuntimeLogLevelStateLive = RuntimeLogLevelState.layer;
export const RuntimeLogSinkLive = RuntimeLogSink.layer;

export const setRuntimeLogLevel = Effect.fn("Logging.setRuntimeLogLevel")(function* (
  level: string | undefined,
) {
  const state = yield* RuntimeLogLevelState;
  yield* state.set(level);
});

const makeRuntimeLoggerLayer = Effect.fn("Logging.makeRuntimeLoggerLayer")(function* () {
  const state = yield* RuntimeLogLevelState;
  const sink = yield* RuntimeLogSink;

  // v4 loggers are synchronous: the level gate and the sink run via runSync.
  // Both are synchronous under the hood (Ref.get, console writes), so this
  // never blocks the fiber.
  return Logger.layer([
    Logger.make<unknown, void>((options) => {
      const runtimeLogLevel = Effect.runSync(state.get);

      if (LogLevel.getOrdinal(options.logLevel) < LogLevel.getOrdinal(runtimeLogLevel)) {
        return;
      }

      const line = JSON.stringify({
        cause: Cause.pretty(options.cause),
        level: options.logLevel,
        message: options.message,
        timestamp: options.date.toISOString(),
      });

      Effect.runSync(
        sink.write({
          level: options.logLevel,
          line,
        }),
      );
    }),
  ]);
});

const RuntimeLoggerLive = Layer.unwrap(makeRuntimeLoggerLayer());

const RuntimeLoggerDependenciesLive = Layer.mergeAll(RuntimeLogLevelStateLive, RuntimeLogSinkLive);

export const RuntimeLoggerLayer = RuntimeLoggerLive.pipe(
  Layer.provideMerge(RuntimeLoggerDependenciesLive),
);

function parseRuntimeLogLevel(level: string | undefined) {
  if (!level) {
    return LOG_LEVELS.info;
  }

  return LOG_LEVEL_ALIASES[level.toLowerCase()] ?? LOG_LEVELS.info;
}

function formatUnknown(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  return Option.liftThrowable(() => JSON.stringify(value))().pipe(
    Option.getOrElse(() => {
      if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
        return globalThis.String(value);
      }

      return typeof value;
    }),
  );
}
