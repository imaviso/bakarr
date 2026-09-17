import {
  Cause,
  Context,
  Effect,
  Formatter,
  Layer,
  LogLevel,
  Logger,
  Option,
  Predicate,
  Record,
  Ref,
  References,
} from "effect";
import { ObservabilityConfig } from "@/app/config/observability.ts";
import { parseResourceAttributes } from "@/infra/telemetry.ts";
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
      errorCause: formatCauseValue(error.cause),
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
    });
  }

  // Effect tagged errors are plain objects carrying `_tag`/`message`/`cause`;
  // `String()` on them yields "" which hides the actual failure.
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    const record: Record<string, unknown> = error;
    const tag = typeof record["_tag"] === "string" ? record["_tag"] : undefined;
    return compactLogAnnotations({
      errorCause: formatCauseValue(record["cause"]),
      errorMessage: error.message,
      errorName: tag,
    });
  }

  return compactLogAnnotations({
    errorMessage: formatCauseValue(error),
    errorType: typeof error,
  });
}

const LOG_LEVELS: Record<
  "debug" | "error" | "fatal" | "info" | "none" | "trace" | "warn",
  LogLevel.LogLevel
> = {
  debug: "Debug",
  error: "Error",
  fatal: "Fatal",
  info: "Info",
  none: "None",
  trace: "Trace",
  warn: "Warn",
};

const LOG_LEVEL_ALIASES: Record<string, LogLevel.LogLevel> = {
  debug: LOG_LEVELS.debug,
  error: LOG_LEVELS.error,
  fatal: LOG_LEVELS.fatal,
  info: LOG_LEVELS.info,
  none: LOG_LEVELS.none,
  trace: LOG_LEVELS.trace,
  warn: LOG_LEVELS.warn,
  warning: LOG_LEVELS.warn,
};

export interface RuntimeLogLevelStateShape {
  readonly get: Effect.Effect<LogLevel.LogLevel>;
  readonly getUnsafe: () => LogLevel.LogLevel;
  readonly set: (level: string | undefined) => Effect.Effect<void>;
}

export interface RuntimeLogSinkShape {
  readonly write: (input: { readonly level: LogLevel.LogLevel; readonly line: string }) => void;
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
        getUnsafe: () => Ref.getUnsafe(ref),
        set: Effect.fn("Logging.setLevel")((level: string | undefined) =>
          Ref.set(ref, parseRuntimeLogLevel(level)),
        ),
      } satisfies RuntimeLogLevelStateShape;
    }),
  );
}

export class RuntimeLogSink extends Context.Service<RuntimeLogSink, RuntimeLogSinkShape>()(
  "@bakarr/api/RuntimeLogSink",
) {
  static readonly layer = Layer.succeed(RuntimeLogSink, {
    write: ({ level, line }) => {
      if (LogLevel.getOrdinal(level) >= LogLevel.getOrdinal("Error")) {
        console.error(line);
        return;
      }

      if (LogLevel.getOrdinal(level) >= LogLevel.getOrdinal("Warn")) {
        console.warn(line);
        return;
      }

      console.log(line);
    },
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

export const makeRuntimeLoggerLayer = Effect.fn("Logging.makeRuntimeLoggerLayer")(function* () {
  const state = yield* RuntimeLogLevelState;
  const sink = yield* RuntimeLogSink;
  const config = yield* ObservabilityConfig;
  const resource = {
    ...parseResourceAttributes(config.resourceAttributes, config.deploymentEnvironment),
    "service.name": config.serviceName,
    "service.version": config.serviceVersion,
  };

  return Layer.mergeAll(
    // The runtime threshold is mutable. Let entries reach this logger before
    // filtering; Effect's default Info threshold would otherwise discard Debug.
    Layer.succeed(References.MinimumLogLevel, "All"),
    Logger.layer([
      Logger.make<unknown, void>((options) => {
        if (LogLevel.getOrdinal(options.logLevel) < LogLevel.getOrdinal(state.getUnsafe())) {
          return;
        }

        const span = options.fiber.currentSpan;
        sink.write({
          level: options.logLevel,
          line: Formatter.formatJson({
            ...Logger.formatStructured.log(options),
            resource,
            traceId: span?.traceId,
            spanId: span?.spanId,
          }),
        });
      }),
    ]),
  );
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

/**
 * Category for a logged failure: error `_tag`/class name for typed failures,
 * "defect" for dies/interrupt-only causes. Used by wide-event style
 * completion events that keep a stable error category instead of raw causes.
 */
export function errorCategory(cause: Cause.Cause<unknown>): string {
  return Option.match(Cause.findErrorOption(cause), {
    onNone: () => (Cause.hasDies(cause) ? "defect" : "interrupted"),
    onSome: errorValueKind,
  });
}

/**
 * Stable category for a plain error value: `_tag` for tagged errors, class
 * name for Errors, `typeof` otherwise. Console annotations carry this instead
 * of raw cause trees, which can embed request bodies, credentials, or SQL.
 */
export function errorValueKind(error: unknown): string {
  if (Predicate.hasProperty(error, "_tag")) {
    return describeTaggedErrorCategory(error);
  }

  if (error instanceof Error) {
    return error.constructor.name;
  }

  return typeof error;
}

/**
 * Console-safe annotations for a caught cause: stable `error_kind` plus typed
 * failure fields. Never embeds the full cause tree, which can carry request
 * bodies, credentials, or SQL text.
 */
export function causeLogAnnotations(cause: Cause.Cause<unknown>): Record<string, unknown> {
  const failure = Cause.findErrorOption(cause);

  if (Option.isSome(failure)) {
    return {
      error_kind: errorValueKind(failure.value),
      ...errorLogAnnotations(failure.value),
    };
  }

  // Die-only causes have no typed failure. Log the first defect's message so
  // programming bugs stay diagnosable; the full tree stays out.
  const defect = findFirstDieDefect(cause);

  if (defect !== undefined) {
    return { error_kind: "defect", ...errorLogAnnotations(defect) };
  }

  return { error_kind: "interrupted" };
}

function findFirstDieDefect(cause: Cause.Cause<unknown>): unknown {
  for (const reason of cause.reasons) {
    if (Cause.isDieReason(reason)) {
      return reason.defect;
    }
  }

  return undefined;
}

function describeTaggedErrorCategory(error: { readonly _tag?: unknown }): string {
  return typeof error._tag === "string" ? error._tag : typeof error;
}

// One-line summary of a nested cause value. Never serializes objects
// wholesale: nested causes can embed SQL text, payloads, or credentials.
function formatCauseValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === "object" && "message" in value && typeof value.message === "string") {
    if (Predicate.hasProperty(value, "_tag") && typeof value._tag === "string") {
      return `${value._tag}: ${value.message}`;
    }

    return value.message;
  }

  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return globalThis.String(value);
  }

  return typeof value;
}
