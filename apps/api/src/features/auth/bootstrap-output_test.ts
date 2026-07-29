import { Terminal } from "effect";
import { Effect, Logger } from "effect";

import { assert, it } from "@effect/vitest";
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
    );

    assert.deepStrictEqual(
      messages.some((message) => message.includes("Failed to display bootstrap credentials")),
      true,
    );
    assert.deepStrictEqual(
      messages.some((message) => message.includes("INITIAL SETUP")),
      true,
    );
    assert.deepStrictEqual(
      messages.some((message) => message.includes("Password: secret-pass")),
      true,
    );
  }),
);
