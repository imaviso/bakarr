import { BunFileSystem } from "@effect/platform-bun";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, it } from "@effect/vitest";
import { Cause, Config, ConfigProvider, Effect, Exit, Redacted } from "effect";

import { makeDotenvConfigProvider } from "@/config/provider.ts";

const withBunFs = Effect.provide(BunFileSystem.layer);

it.scoped("dotenv provider uses .env values when env vars are missing", () =>
  withTempEnvFile(
    [
      "PORT=9200",
      "BAKARR_BOOTSTRAP_USERNAME=dotenv-admin",
      'BAKARR_BOOTSTRAP_PASSWORD="super-secret"',
    ].join("\n"),
    (dotenvFile) =>
      Effect.gen(function* () {
        const provider = yield* makeDotenvConfigProvider({
          envProvider: ConfigProvider.fromMap(new Map()),
          path: dotenvFile,
        }).pipe(withBunFs);

        const result = yield* Effect.gen(function* () {
          const port = yield* Config.number("PORT");
          const username = yield* Config.string("BAKARR_BOOTSTRAP_USERNAME");
          const password = yield* Config.redacted("BAKARR_BOOTSTRAP_PASSWORD");

          return {
            password: Redacted.value(password),
            port,
            username,
          };
        }).pipe(Effect.withConfigProvider(provider));

        assert.deepStrictEqual(result.port, 9200);
        assert.deepStrictEqual(result.username, "dotenv-admin");
        assert.deepStrictEqual(result.password, "super-secret");
      }),
  ),
);

it.scoped("dotenv provider prioritizes environment variables over .env", () =>
  withTempEnvFile("PORT=9200\n", (dotenvFile) =>
    Effect.gen(function* () {
      const provider = yield* makeDotenvConfigProvider({
        envProvider: ConfigProvider.fromMap(new Map([["PORT", "9300"]])),
        path: dotenvFile,
      }).pipe(withBunFs);

      const result = yield* Config.number("PORT").pipe(Effect.withConfigProvider(provider));

      assert.deepStrictEqual(result, 9300);
    }),
  ),
);

it.scoped("dotenv provider handles missing dotenv file", () =>
  Effect.gen(function* () {
    const provider = yield* makeDotenvConfigProvider({
      envProvider: ConfigProvider.fromMap(new Map([["SESSION_COOKIE_NAME", "from-env"]])),
      path: "./missing-dotenv-file.env",
    }).pipe(withBunFs);

    const value = yield* Config.string("SESSION_COOKIE_NAME").pipe(
      Effect.withConfigProvider(provider),
    );

    assert.deepStrictEqual(value, "from-env");
  }),
);

it.scoped("dotenv provider parses export comments and quoted values", () =>
  withTempEnvFile(
    [
      "export BAKARR_BOOTSTRAP_USERNAME=from-export",
      "SESSION_COOKIE_NAME=session-from-dotenv # trailing comment",
      "PORT=9401",
      'BAKARR_BOOTSTRAP_PASSWORD="line1\\nline2 # kept"',
      "MISSING_KEY='raw # kept'",
    ].join("\n"),
    (dotenvFile) =>
      Effect.gen(function* () {
        const provider = yield* makeDotenvConfigProvider({
          envProvider: ConfigProvider.fromMap(new Map()),
          path: dotenvFile,
        }).pipe(withBunFs);

        const result = yield* Effect.gen(function* () {
          const username = yield* Config.string("BAKARR_BOOTSTRAP_USERNAME");
          const cookie = yield* Config.string("SESSION_COOKIE_NAME");
          const port = yield* Config.number("PORT");
          const password = yield* Config.redacted("BAKARR_BOOTSTRAP_PASSWORD");
          const missing = yield* Config.string("MISSING_KEY");

          return {
            cookie,
            missing,
            password: Redacted.value(password),
            port,
            username,
          };
        }).pipe(Effect.withConfigProvider(provider));

        assert.deepStrictEqual(result.username, "from-export");
        assert.deepStrictEqual(result.cookie, "session-from-dotenv");
        assert.deepStrictEqual(result.port, 9401);
        assert.deepStrictEqual(result.password, "line1\nline2 # kept");
        assert.deepStrictEqual(result.missing, "raw # kept");
      }),
  ),
);

it.scoped("dotenv provider fails with line information on parse errors", () =>
  withTempEnvFile(["PORT=9402", "INVALID_LINE"].join("\n"), (dotenvFile) =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        makeDotenvConfigProvider({ path: dotenvFile }).pipe(withBunFs),
      );

      assert.deepStrictEqual(Exit.isFailure(exit), true);

      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");

        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value._tag, "DotenvParseError");

          if (failure.value._tag === "DotenvParseError") {
            assert.deepStrictEqual(failure.value.line, 2);
          }
        }
      }
    }),
  ),
);

const withTempEnvFile = Effect.fn("Test.withTempEnvFile")(function* <A, E, R>(
  contents: string,
  run: (filePath: string) => Effect.Effect<A, E, R>,
) {
  const filePath = join(tmpdir(), `bakarr-${randomUUID()}.env`);

  return yield* Effect.acquireUseRelease(
    Effect.tryPromise(() => writeFile(filePath, contents)).pipe(Effect.as(filePath)),
    run,
    (path) =>
      Effect.tryPromise(() => rm(path, { force: true })).pipe(Effect.catchAll(() => Effect.void)),
  );
});
