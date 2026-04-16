import { FileSystem } from "@effect/platform";
import { parseEnv } from "node:util";
import { ConfigProvider, Effect, Option, Schema } from "effect";
import { isSystemNotFoundError } from "@/lib/fs-errors.ts";

const DEFAULT_DOTENV_PATH = ".env";

class DotenvReadError extends Schema.TaggedError<DotenvReadError>()("DotenvReadError", {
  cause: Schema.Defect,
  message: Schema.String,
  path: Schema.String,
}) {}

class DotenvParseError extends Schema.TaggedError<DotenvParseError>()("DotenvParseError", {
  line: Schema.Number,
  message: Schema.String,
  path: Schema.String,
}) {}

export interface DotenvConfigProviderOptions {
  readonly envProvider?: ConfigProvider.ConfigProvider;
  readonly path?: string;
}

export const makeDotenvConfigProvider = Effect.fn("Config.makeDotenvConfigProvider")(
  (
    options: DotenvConfigProviderOptions = {},
  ): Effect.Effect<
    ConfigProvider.ConfigProvider,
    DotenvReadError | DotenvParseError,
    FileSystem.FileSystem
  > =>
    Effect.gen(function* () {
      const dotenvPath = options.path ?? DEFAULT_DOTENV_PATH;
      const envProvider = options.envProvider ?? ConfigProvider.fromEnv();
      const fileContent = yield* readDotenvFile(dotenvPath);

      if (Option.isNone(fileContent)) {
        return envProvider;
      }

      const dotenvEntries = yield* parseDotenvText(dotenvPath, fileContent.value);

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
  (path: string): Effect.Effect<Option.Option<string>, DotenvReadError, FileSystem.FileSystem> =>
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
  (path: string, bytes: Uint8Array): Effect.Effect<string, DotenvReadError> =>
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
): Effect.Effect<Map<string, string>, DotenvParseError> {
  return Effect.gen(function* () {
    const normalizedSource = source.replace(/^\uFEFF/, "");
    const lines = normalizedSource.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;
      const trimmed = lines[index]!.trim();

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
    }

    const parsed = parseEnv(normalizedSource);
    const entries = new Map<string, string>();

    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined && DOTENV_KEY_PATTERN.test(key)) {
        entries.set(key, value);
      }
    }

    return entries;
  });
}
