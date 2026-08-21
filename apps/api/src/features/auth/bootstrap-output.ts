import { Terminal } from "@effect/platform";
import { Cause, Effect } from "effect";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const CREDENTIALS_FILE_NAME = "bootstrap-credentials.txt";

export const announceBootstrapCredentials = Effect.fn(
  "AuthBootstrapOutput.announceBootstrapCredentials",
)(function* (input: { outputDir: string; username: string; password?: string }) {
  const terminal = yield* Effect.serviceOption(Terminal.Terminal);

  if (terminal._tag === "Some") {
    const isTTY = yield* terminal.value.isTTY;

    if (isTTY) {
      const details = input.password
        ? `* Username: ${input.username}\n* Password: ${input.password}\n`
        : `* Username: ${input.username}\n* Password: use the configured bootstrap credential\n`;
      const text = `\n*************************************************************\n* INITIAL SETUP\n* Bootstrap user created.\n${details}* Please log in and change your password.\n*************************************************************\n`;

      const displayed = yield* terminal.value.display(text).pipe(
        Effect.as(true),
        Effect.catchAllCause((cause) =>
          Effect.logWarning(
            "Failed to display bootstrap credentials in terminal; falling back to file output",
          ).pipe(Effect.annotateLogs({ cause: Cause.pretty(cause) }), Effect.as(false)),
        ),
      );

      if (displayed) {
        return;
      }
    }
  }

  if (input.password === undefined) {
    yield* Effect.logInfo(
      `\n* INITIAL SETUP: Bootstrap user created.\n* Username: ${input.username}\n* Password: use the configured bootstrap credential\n* Please log in and change your password.\n`,
    );
    return;
  }

  // Non-TTY fallback: never send the plaintext password through the logger.
  // Write it to a 0600 file next to the database and log only the path.
  const credentialsFilePath = join(input.outputDir, CREDENTIALS_FILE_NAME);

  const written = yield* writeCredentialsFile(
    credentialsFilePath,
    input.username,
    input.password,
  ).pipe(
    Effect.as(true),
    Effect.catchAllCause((cause) =>
      Effect.logError("Failed to write bootstrap credentials file").pipe(
        Effect.annotateLogs({ cause: Cause.pretty(cause), output_dir: input.outputDir }),
        Effect.as(false),
      ),
    ),
  );

  if (!written) {
    return;
  }

  yield* Effect.logInfo(
    `\n* INITIAL SETUP: Bootstrap user created.\n* Username: ${input.username}\n* Credentials written to ${credentialsFilePath} (mode 0600) — delete this file after first login.\n`,
  ).pipe(Effect.annotateLogs({ component: "auth", event: "auth.bootstrap.credentials_file" }));
});

function writeCredentialsFile(filePath: string, username: string, password: string) {
  return Effect.tryPromise({
    try: () =>
      writeFile(filePath, `username: ${username}\npassword: ${password}\n`, {
        encoding: "utf8",
        flag: "w",
        mode: 0o600,
      }),
    catch: (cause) => new Error("bootstrap credentials file write failed", { cause }),
  });
}
