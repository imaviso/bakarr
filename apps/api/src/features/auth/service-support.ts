import { Terminal } from "@effect/platform";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { sessions, systemLogs, users } from "../../db/schema.ts";
import { toDatabaseError, tryDatabasePromise } from "../../lib/effect-db.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export const hashToken = Effect.fn("Auth.hashToken")(function* (token: string) {
  const data = new TextEncoder().encode(token);
  const hashBuffer = yield* Effect.tryPromise({
    try: () => crypto.subtle.digest("SHA-256", data),
    catch: toDatabaseError("Failed to hash token"),
  });
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
});

export const findUserByUsername = Effect.fn("Auth.findUserByUsername")(
  function* (db: AppDatabase, username: string) {
    const rows = yield* tryDatabasePromise(
      "Failed to find user by username",
      () =>
        db.select().from(users).where(eq(users.username, username)).limit(1),
    );
    return rows[0] ?? null;
  },
);

export const findUserByApiKey = Effect.fn("Auth.findUserByApiKey")(
  function* (db: AppDatabase, apiKey: string) {
    const rows = yield* tryDatabasePromise(
      "Failed to find user by API key",
      () => db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1),
    );
    return rows[0] ?? null;
  },
);

export const findUserById = Effect.fn("Auth.findUserById")(
  function* (db: AppDatabase, userId: number) {
    const rows = yield* tryDatabasePromise(
      "Failed to find user by ID",
      () => db.select().from(users).where(eq(users.id, userId)).limit(1),
    );
    return rows[0] ?? null;
  },
);

export const createSession = Effect.fn("Auth.createSession")(
  function* (db: AppDatabase, durationDays: number, userId: number) {
    const token = randomHex(32);
    const tokenHash = yield* hashToken(token);
    const now = nowIso();

    yield* tryDatabasePromise(
      "Failed to create session",
      () =>
        db.insert(sessions).values({
          createdAt: now,
          expiresAt: expiresAtIso(durationDays),
          lastSeenAt: now,
          token: tokenHash,
          userId,
        }),
    );

    return token;
  },
);

export const writeLog = Effect.fn("Auth.writeLog")(
  function* (
    db: AppDatabase,
    input: {
      eventType: string;
      level: string;
      message: string;
      details?: string;
    },
  ) {
    yield* tryDatabasePromise(
      "Failed to write log",
      () =>
        db.insert(systemLogs).values({
          createdAt: nowIso(),
          details: input.details ?? null,
          eventType: input.eventType,
          level: input.level,
          message: input.message,
        }),
    );
  },
);

export const announceBootstrapCredentials = Effect.fn(
  "Auth.announceBootstrapCredentials",
)(function* (input: { username: string; password: string }) {
  const terminal = yield* Effect.serviceOption(Terminal.Terminal);

  if (terminal._tag === "Some") {
    const isTTY = yield* terminal.value.isTTY;

    if (isTTY) {
      const text =
        `\n*************************************************************\n* INITIAL SETUP\n* Bootstrap user created.\n* Username: ${input.username}\n* Password: ${input.password}\n* Please log in and change your password.\n*************************************************************\n`;

      yield* terminal.value.display(text).pipe(
        Effect.catchAll(() => Effect.void),
      );
      return;
    }
  }

  yield* Effect.logInfo(
    "\n* INITIAL SETUP: Bootstrap user created. Log in with the configured credentials and change your password.\n",
  );
});

export function expiresAtIso(durationDays: number) {
  return new Date(Date.now() + durationDays * DAY_MS).toISOString();
}

export function nowIso() {
  return new Date().toISOString();
}

export function randomHex(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (entry) => entry.toString(16).padStart(2, "0")).join(
    "",
  );
}
