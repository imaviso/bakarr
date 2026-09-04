// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)

import { Effect, Logger } from "effect";
import * as Terminal from "effect/Terminal";

import { assert, it } from "@effect/vitest";
import { announceBootstrapCredentials } from "@/features/auth/bootstrap-output.ts";
import { exists, withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";

it.effect("announceBootstrapCredentials logs a fallback message when terminal display fails", () =>
  Effect.gen(function* () {
    const messages: string[] = [];
    const logger = Logger.make<unknown, void>(({ message }) => {
      messages.push(globalThis.String(message));
    });

    // Force the TTY branch: the source gates on process.stdout.isTTY.
    const stdoutWithTty = process.stdout as NodeJS.WriteStream & { isTTY: boolean };
    const originalIsTTY = Object.getOwnPropertyDescriptor(stdoutWithTty, "isTTY");
    Object.defineProperty(stdoutWithTty, "isTTY", { value: true, configurable: true });

    yield* announceBootstrapCredentials({
      outputDir: "/unused",
      username: "demo",
    }).pipe(
      Effect.provideService(
        Terminal.Terminal,
        Terminal.make({
          columns: Effect.succeed(80),
          display: () => Effect.die(new Error("tty write failed")),
          readInput: Effect.die(new Error("unused")),
          readLine: Effect.die(new Error("unused")),
          rows: Effect.succeed(24),
        }),
      ),
      Effect.provide(Logger.layer([logger])),
      Effect.ensuring(
        Effect.sync(() => {
          if (originalIsTTY) {
            Object.defineProperty(stdoutWithTty, "isTTY", originalIsTTY);
          } else {
            delete (stdoutWithTty as { isTTY?: boolean }).isTTY;
          }
        }),
      ),
    );

    assert.deepStrictEqual(
      messages.some((message) => message.includes("Failed to display bootstrap credentials")),
      true,
    );
    assert.deepStrictEqual(
      messages.some((message) => message.includes("INITIAL SETUP")),
      true,
    );
  }),
);

it.effect("non-TTY fallback writes credentials to a 0600 file and logs only the path", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const messages: string[] = [];
      const logger = Logger.make<unknown, void>(({ message }) => {
        messages.push(globalThis.String(message));
      });
      const credentialsFilePath = `${root}/bootstrap-credentials.txt`;

      yield* announceBootstrapCredentials({
        outputDir: root,
        password: "secret-pass",
        username: "demo",
      }).pipe(
        // No Terminal service in context -> non-TTY fallback path.
        Effect.provide(Logger.layer([logger])),
      );

      assert.deepStrictEqual(yield* exists(fs, credentialsFilePath), true);

      const stats = yield* Effect.promise(() =>
        import("node:fs").then((module) => module.statSync(credentialsFilePath)),
      );
      assert.deepStrictEqual(stats.mode & 0o777, 0o600);

      assert.deepStrictEqual(
        messages.some((message) => message.includes(credentialsFilePath)),
        true,
      );
      assert.deepStrictEqual(
        messages.some((message) => message.includes("secret-pass")),
        false,
      );
    }),
  ),
);

it.effect("non-TTY fallback without a generated password logs guidance only", () =>
  Effect.gen(function* () {
    const messages: string[] = [];
    const logger = Logger.make<unknown, void>(({ message }) => {
      messages.push(globalThis.String(message));
    });

    yield* announceBootstrapCredentials({
      outputDir: "/unused",
      username: "demo",
    }).pipe(Effect.provide(Logger.layer([logger])));

    assert.deepStrictEqual(
      messages.some((message) => message.includes("use the configured bootstrap credential")),
      true,
    );
  }),
);
