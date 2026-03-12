import { LogLevel, Logger } from "effect";

export function compactLogAnnotations(
  annotations: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(annotations).filter(([, value]) => value !== undefined),
  );
}

export function durationMsSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export function errorLogAnnotations(
  error: unknown,
): Record<string, unknown> {
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

let runtimeLogLevel = LogLevel.Info;

export function setRuntimeLogLevel(level: string | undefined) {
  runtimeLogLevel = parseRuntimeLogLevel(level);
}

export function getRuntimeLogLevel() {
  return runtimeLogLevel;
}

export const RuntimeLogger = Logger.make<unknown, void>((options) => {
  if (options.logLevel.ordinal < runtimeLogLevel.ordinal) {
    return;
  }

  const line = Logger.jsonLogger.log(options);

  switch (options.logLevel.label) {
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
});

export const RuntimeLoggerLayer = Logger.replace(
  Logger.defaultLogger,
  RuntimeLogger,
);

function parseRuntimeLogLevel(level: string | undefined) {
  switch (level?.toLowerCase()) {
    case "error":
      return LOG_LEVELS.error;
    case "warn":
    case "warning":
      return LOG_LEVELS.warn;
    case "debug":
      return LOG_LEVELS.debug;
    case "trace":
      return LOG_LEVELS.trace;
    case "info":
    default:
      return LOG_LEVELS.info;
  }
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
    return String(value);
  }
}
