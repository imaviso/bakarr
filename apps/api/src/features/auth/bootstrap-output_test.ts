import assert from "node:assert/strict";
import { Terminal } from "@effect/platform";
import { Effect, Logger } from "effect";

import { it } from "@effect/vitest";
import { announceBootstrapCredentials } from "@/features/auth/bootstrap-output.ts";

it.effect("announceBootstrapCredentials logs a fallback message when terminal display fails", () =>
  Effect.gen(function* () {
    const messages: string[] = [];
    const logger = Logger.make<unknown, void>(({ message }) => {
      messages.push(String(message));
    });

    yield* announceBootstrapCredentials({
      password: "secret-pass",
      username: "demo",
    }).pipe(
      Effect.provideService(Terminal.Terminal, {
        columns: Effect.succeed(80),
        display: () => Effect.die(new Error("tty write failed")),
        isTTY: Effect.succeed(true),
        readInput: Effect.die("unused"),
        readLine: Effect.die("unused"),
        rows: Effect.succeed(24),
      }),
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
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
