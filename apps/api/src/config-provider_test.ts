import { NodeFileSystem } from "@effect/platform-node";
import { assertEquals } from "@std/assert";
import { Cause, Config, Effect, Exit, Redacted } from "effect";

import { makeDotenvConfigProvider } from "./config-provider.ts";

const withNodeFs = Effect.provide(NodeFileSystem.layer);

const ENV_KEYS = [
  "PORT",
  "BAKARR_BOOTSTRAP_USERNAME",
  "BAKARR_BOOTSTRAP_PASSWORD",
  "SESSION_COOKIE_NAME",
  "MISSING_KEY",
] as const;

Deno.test("dotenv provider uses .env values when env vars are missing", async () => {
  const dotenvFile = await Deno.makeTempFile({ suffix: ".env" });

  try {
    await Deno.writeTextFile(
      dotenvFile,
      [
        "PORT=9200",
        "BAKARR_BOOTSTRAP_USERNAME=dotenv-admin",
        'BAKARR_BOOTSTRAP_PASSWORD="super-secret"',
      ].join("\n"),
    );

    const provider = await Effect.runPromise(
      makeDotenvConfigProvider({ path: dotenvFile }).pipe(withNodeFs),
    );

    const program = Effect.gen(function* () {
      const port = yield* Config.number("PORT");
      const username = yield* Config.string("BAKARR_BOOTSTRAP_USERNAME");
      const password = yield* Config.redacted("BAKARR_BOOTSTRAP_PASSWORD");

      return {
        password: Redacted.value(password),
        port,
        username,
      };
    }).pipe(Effect.withConfigProvider(provider));

    const result = await withTemporaryEnv({}, () => program);

    assertEquals(result.port, 9200);
    assertEquals(result.username, "dotenv-admin");
    assertEquals(result.password, "super-secret");
  } finally {
    await Deno.remove(dotenvFile).catch(() => undefined);
  }
});

Deno.test("dotenv provider prioritizes environment variables over .env", async () => {
  const dotenvFile = await Deno.makeTempFile({ suffix: ".env" });

  try {
    await Deno.writeTextFile(dotenvFile, "PORT=9200\n");

    const provider = await Effect.runPromise(
      makeDotenvConfigProvider({ path: dotenvFile }).pipe(withNodeFs),
    );

    const program = Config.number("PORT").pipe(
      Effect.withConfigProvider(provider),
    );

    const result = await withTemporaryEnv({ PORT: "9300" }, () => program);

    assertEquals(result, 9300);
  } finally {
    await Deno.remove(dotenvFile).catch(() => undefined);
  }
});

Deno.test("dotenv provider handles missing dotenv file", async () => {
  const provider = await Effect.runPromise(
    makeDotenvConfigProvider({ path: "./missing-dotenv-file.env" }).pipe(
      withNodeFs,
    ),
  );

  const value = await withTemporaryEnv(
    { SESSION_COOKIE_NAME: "from-env" },
    () =>
      Config.string("SESSION_COOKIE_NAME").pipe(
        Effect.withConfigProvider(provider),
      ),
  );

  assertEquals(value, "from-env");
});

Deno.test("dotenv provider parses export comments and quoted values", async () => {
  const dotenvFile = await Deno.makeTempFile({ suffix: ".env" });

  try {
    await Deno.writeTextFile(
      dotenvFile,
      [
        "export BAKARR_BOOTSTRAP_USERNAME=from-export",
        "SESSION_COOKIE_NAME=session-from-dotenv # trailing comment",
        "PORT=9401",
        'BAKARR_BOOTSTRAP_PASSWORD="line1\\nline2 # kept"',
        "MISSING_KEY='raw # kept'",
      ].join("\n"),
    );

    const provider = await Effect.runPromise(
      makeDotenvConfigProvider({ path: dotenvFile }).pipe(withNodeFs),
    );

    const result = await withTemporaryEnv({}, () =>
      Effect.gen(function* () {
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
      }).pipe(Effect.withConfigProvider(provider)));

    assertEquals(result.username, "from-export");
    assertEquals(result.cookie, "session-from-dotenv");
    assertEquals(result.port, 9401);
    assertEquals(result.password, "line1\nline2 # kept");
    assertEquals(result.missing, "raw # kept");
  } finally {
    await Deno.remove(dotenvFile).catch(() => undefined);
  }
});

Deno.test("dotenv provider fails with line information on parse errors", async () => {
  const dotenvFile = await Deno.makeTempFile({ suffix: ".env" });

  try {
    await Deno.writeTextFile(
      dotenvFile,
      ["PORT=9402", "INVALID_LINE"].join("\n"),
    );

    const exit = await Effect.runPromiseExit(
      makeDotenvConfigProvider({ path: dotenvFile }).pipe(withNodeFs),
    );

    assertEquals(Exit.isFailure(exit), true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assertEquals(failure._tag, "Some");

      if (failure._tag === "Some") {
        assertEquals(failure.value._tag, "DotenvParseError");

        if (failure.value._tag === "DotenvParseError") {
          assertEquals(failure.value.line, 2);
        }
      }
    }
  } finally {
    await Deno.remove(dotenvFile).catch(() => undefined);
  }
});

async function withTemporaryEnv<A>(
  nextValues: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  run: () => Effect.Effect<A, unknown, never>,
) {
  const previous = new Map<string, string | undefined>();

  for (const key of ENV_KEYS) {
    previous.set(key, Deno.env.get(key));

    const incoming = nextValues[key];
    if (incoming === undefined) {
      Deno.env.delete(key);
    } else {
      Deno.env.set(key, incoming);
    }
  }

  try {
    return await Effect.runPromise(run());
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
  }
}
