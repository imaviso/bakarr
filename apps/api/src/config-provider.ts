import { FileSystem } from "@effect/platform";
import { ConfigProvider, Effect, Option, Schema } from "effect";
import { isSystemNotFoundError } from "./lib/fs-errors.ts";

const DEFAULT_DOTENV_PATH = ".env";

class DotenvReadError extends Schema.TaggedError<DotenvReadError>()(
  "DotenvReadError",
  {
    cause: Schema.Defect,
    message: Schema.String,
    path: Schema.String,
  },
) {}

class DotenvParseError extends Schema.TaggedError<DotenvParseError>()(
  "DotenvParseError",
  {
    line: Schema.Number,
    message: Schema.String,
    path: Schema.String,
  },
) {}

export interface DotenvConfigProviderOptions {
  readonly path?: string;
}

export const makeDotenvConfigProvider = Effect.fn(
  "Config.makeDotenvConfigProvider",
)(
  (
    options: DotenvConfigProviderOptions = {},
  ): Effect.Effect<
    ConfigProvider.ConfigProvider,
    DotenvReadError | DotenvParseError,
    FileSystem.FileSystem
  > =>
    Effect.gen(function* () {
      const dotenvPath = options.path ?? DEFAULT_DOTENV_PATH;
      const envProvider = ConfigProvider.fromEnv();
      const fileContent = yield* readDotenvFile(dotenvPath);

      if (Option.isNone(fileContent)) {
        return envProvider;
      }

      const dotenvEntries = yield* parseDotenvText(
        dotenvPath,
        fileContent.value,
      );

      if (dotenvEntries.size === 0) {
        return envProvider;
      }

      const dotenvProvider = ConfigProvider.fromMap(dotenvEntries, {
        pathDelim: "_",
      });

      return envProvider.pipe(ConfigProvider.orElse(() => dotenvProvider));
    }),
);

const readDotenvFile = Effect.fn("Config.readDotenvFile")(
  (
    path: string,
  ): Effect.Effect<
    Option.Option<string>,
    DotenvReadError,
    FileSystem.FileSystem
  > =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs.readFile(path).pipe(
        Effect.flatMap((bytes) => decodeDotenvBytes(path, bytes)),
        Effect.map(Option.some),
        Effect.catchTags({
          SystemError: (error) =>
            isSystemNotFoundError(error)
              ? Effect.succeed(Option.none<string>())
              : Effect.fail(
                new DotenvReadError({
                  cause: error,
                  message: `Failed to read dotenv file: ${path}`,
                  path,
                }),
              ),
          BadArgument: (error) =>
            Effect.fail(
              new DotenvReadError({
                cause: error,
                message: `Invalid path for dotenv file: ${path}`,
                path,
              }),
            ),
        }),
      );
    }),
);

const decodeDotenvBytes = Effect.fn("Config.decodeDotenvBytes")(
  (
    path: string,
    bytes: Uint8Array,
  ): Effect.Effect<string, DotenvReadError, never> =>
    Effect.try({
      try: () => new TextDecoder().decode(bytes),
      catch: (cause) =>
        new DotenvReadError({
          cause,
          message: `Failed to decode dotenv file: ${path}`,
          path,
        }),
    }),
);

const DOTENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseDotenvText(
  path: string,
  source: string,
): Effect.Effect<Map<string, string>, DotenvParseError, never> {
  return Effect.gen(function* () {
    const entries = new Map<string, string>();
    const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;
      const rawLine = lines[index];
      const trimmed = rawLine.trim();

      if (trimmed.length === 0 || trimmed.startsWith("#")) {
        continue;
      }

      const normalized = trimmed.startsWith("export ")
        ? trimmed.slice("export ".length).trimStart()
        : trimmed;
      const equalsIndex = normalized.indexOf("=");

      if (equalsIndex <= 0) {
        return yield* new DotenvParseError({
          line: lineNumber,
          message: "Invalid dotenv entry: expected KEY=VALUE",
          path,
        });
      }

      const key = normalized.slice(0, equalsIndex).trim();

      if (!DOTENV_KEY_PATTERN.test(key)) {
        return yield* new DotenvParseError({
          line: lineNumber,
          message: `Invalid dotenv key: ${key}`,
          path,
        });
      }

      const value = yield* parseDotenvValue(
        path,
        lineNumber,
        normalized.slice(equalsIndex + 1).trim(),
      );
      entries.set(key, value);
    }

    return entries;
  });
}

function parseDotenvValue(
  path: string,
  line: number,
  input: string,
): Effect.Effect<string, DotenvParseError, never> {
  if (input.length === 0) {
    return Effect.succeed("");
  }

  if (input.startsWith('"')) {
    if (!input.endsWith('"') || input.length === 1) {
      return Effect.fail(
        new DotenvParseError({
          line,
          message: "Unterminated double-quoted dotenv value",
          path,
        }),
      );
    }

    const quoted = input.slice(1, -1);
    return Effect.succeed(
      quoted
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\"),
    );
  }

  if (input.startsWith("'")) {
    if (!input.endsWith("'") || input.length === 1) {
      return Effect.fail(
        new DotenvParseError({
          line,
          message: "Unterminated single-quoted dotenv value",
          path,
        }),
      );
    }

    return Effect.succeed(input.slice(1, -1));
  }

  const commentIndex = input.search(/\s#/);
  const value = commentIndex >= 0 ? input.slice(0, commentIndex) : input;

  return Effect.succeed(value.trimEnd());
}
