import { Terminal } from "@effect/platform";
import { Cause, Effect } from "effect";

export const announceBootstrapCredentials = Effect.fn(
  "AuthBootstrapOutput.announceBootstrapCredentials",
)(function* (input: { username: string; password?: string }) {
  const terminal = yield* Effect.serviceOption(Terminal.Terminal);
  const details = input.password
    ? `* Username: ${input.username}\n* Password: ${input.password}\n`
    : `* Username: ${input.username}\n* Password: use the configured bootstrap credential\n`;

  if (terminal._tag === "Some") {
    const isTTY = yield* terminal.value.isTTY;

    if (isTTY) {
      const text = `\n*************************************************************\n* INITIAL SETUP\n* Bootstrap user created.\n${details}* Please log in and change your password.\n*************************************************************\n`;

      const displayed = yield* terminal.value.display(text).pipe(
        Effect.as(true),
        Effect.catchAllCause((cause) =>
          Effect.logWarning(
            "Failed to display bootstrap credentials in terminal; falling back to logger output",
          ).pipe(Effect.annotateLogs({ cause: Cause.pretty(cause) }), Effect.as(false)),
        ),
      );

      if (displayed) {
        return;
      }
    }
  }

  yield* Effect.logInfo(
    `\n* INITIAL SETUP: Bootstrap user created.\n${details}* Please log in and change your password.\n`,
  );
});
