import { Context, Effect, Layer, Logger, LogLevel, Ref } from "effect";

export function compactLogAnnotations(
  annotations: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(annotations).filter(([, value]) => value !== undefined));
}

export function durationMsSince(startedAt: number, finishedAt: number): number {
  return Math.max(0, Math.round(finishedAt - startedAt));
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

const LOG_LEVELS = {
  debug: LogLevel.Debug,
  error: LogLevel.Error,
  info: LogLevel.Info,
  trace: LogLevel.Trace,
  warn: LogLevel.Warning,
} as const;

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
    readonly levelLabel: string;
    readonly line: string;
  }) => Effect.Effect<void>;
}

export class RuntimeLogLevelState extends Context.Tag("@bakarr/api/RuntimeLogLevelState")<
  RuntimeLogLevelState,
  RuntimeLogLevelStateShape
>() {}

export class RuntimeLogSink extends Context.Tag("@bakarr/api/RuntimeLogSink")<
  RuntimeLogSink,
  RuntimeLogSinkShape
>() {}

export const RuntimeLogLevelStateLive = Layer.effect(
  RuntimeLogLevelState,
  Effect.gen(function* () {
    const ref = yield* Ref.make(LogLevel.Info);

    return RuntimeLogLevelState.of({
      get: Ref.get(ref),
      set: (level) => Ref.set(ref, parseRuntimeLogLevel(level)),
    });
  }),
);

export const RuntimeLogSinkLive = Layer.succeed(
  RuntimeLogSink,
  RuntimeLogSink.of({
    write: ({ levelLabel, line }) =>
      Effect.sync(() => {
        switch (levelLabel) {
          case "ERROR":
          case "FATAL":
            console.error(line);
            break;
          case "WARN":
            console.warn(line);
            break;
          default:
            console.log(line);
            break;
        }
      }),
  }),
);

export const setRuntimeLogLevel = Effect.fn("Logging.setRuntimeLogLevel")(function* (
  level: string | undefined,
) {
  const state = yield* RuntimeLogLevelState;
  yield* state.set(level);
});

const makeRuntimeLoggerLayer = Effect.fn("Logging.makeRuntimeLoggerLayer")(function* () {
  const state = yield* RuntimeLogLevelState;
  const sink = yield* RuntimeLogSink;

  return Logger.replace(
    Logger.defaultLogger,
    Logger.make<unknown, void>((options) =>
      Effect.gen(function* () {
        const runtimeLogLevel = yield* state.get;

        if (options.logLevel.ordinal < runtimeLogLevel.ordinal) {
          return;
        }

        const line = Logger.jsonLogger.log(options);

        yield* sink.write({
          levelLabel: options.logLevel.label,
          line,
        });
      }),
    ),
  );
});

const RuntimeLoggerLive = Layer.unwrapEffect(makeRuntimeLoggerLayer());

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

  try {
    return JSON.stringify(value);
  } catch {
    if (typeof value === "object" && value !== null) {
      return Object.prototype.toString.call(value);
    }

    if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
      return String(value);
    }

    return typeof value;
  }
}
