import { Terminal } from "@effect/platform";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { sessions, systemLogs, users } from "../../db/schema.ts";
import { currentTimeMillis, nowIso } from "../../lib/clock.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { randomHex } from "../../lib/random.ts";

export { nowIso, randomHex };

const DAY_MS = 24 * 60 * 60 * 1000;

export const findUserByUsername = Effect.fn("Auth.findUserByUsername")(function* (
  db: AppDatabase,
  username: string,
) {
  const rows = yield* tryDatabasePromise("Failed to find user by username", () =>
    db.select().from(users).where(eq(users.username, username)).limit(1),
  );
  return rows[0] ?? null;
});

export const findUserByApiKey = Effect.fn("Auth.findUserByApiKey")(function* (
  db: AppDatabase,
  apiKey: string,
) {
  const rows = yield* tryDatabasePromise("Failed to find user by API key", () =>
    db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1),
  );
  return rows[0] ?? null;
});

export const findUserById = Effect.fn("Auth.findUserById")(function* (
  db: AppDatabase,
  userId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to find user by ID", () =>
    db.select().from(users).where(eq(users.id, userId)).limit(1),
  );
  return rows[0] ?? null;
});

export const createSession = Effect.fn("Auth.createSession")(function* (
  db: AppDatabase,
  durationDays: number,
  hashToken: (token: string) => Effect.Effect<string, import("../../db/database.ts").DatabaseError>,
  userId: number,
) {
  const token = yield* randomHex(32);
  const tokenHash = yield* hashToken(token);
  const now = yield* nowIso;
  const expiresAt = yield* expiresAtIso(durationDays);

  yield* tryDatabasePromise("Failed to create session", () =>
    db.insert(sessions).values({
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      token: tokenHash,
      userId,
    }),
  );

  return token;
});

export const writeLog = Effect.fn("Auth.writeLog")(function* (
  db: AppDatabase,
  input: {
    eventType: string;
    level: string;
    message: string;
    details?: string;
  },
) {
  const now = yield* nowIso;
  yield* tryDatabasePromise("Failed to write log", () =>
    db.insert(systemLogs).values({
      createdAt: now,
      details: input.details ?? null,
      eventType: input.eventType,
      level: input.level,
      message: input.message,
    }),
  );
});

export const announceBootstrapCredentials = Effect.fn("Auth.announceBootstrapCredentials")(
  function* (input: { username: string; password: string }) {
    const terminal = yield* Effect.serviceOption(Terminal.Terminal);

    if (terminal._tag === "Some") {
      const isTTY = yield* terminal.value.isTTY;

      if (isTTY) {
        const text = `\n*************************************************************\n* INITIAL SETUP\n* Bootstrap user created.\n* Username: ${input.username}\n* Password: ${input.password}\n* Please log in and change your password.\n*************************************************************\n`;

        const displayed = yield* terminal.value.display(text).pipe(
          Effect.as(true),
          Effect.catchAll(() => Effect.succeed(false)),
        );

        if (displayed) {
          return;
        }

        yield* Effect.logWarning(
          "Failed to display bootstrap credentials in terminal; falling back to logger output",
        );
      }
    }

    yield* Effect.logInfo(
      "\n* INITIAL SETUP: Bootstrap user created. Log in with the configured credentials and change your password.\n",
    );
  },
);

export const expiresAtIso = Effect.fn("Auth.expiresAtIso")(function* (durationDays: number) {
  const now = yield* currentTimeMillis;
  return new Date(now + durationDays * DAY_MS).toISOString();
});
