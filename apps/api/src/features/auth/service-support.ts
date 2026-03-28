import { Terminal } from "@effect/platform";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { appConfig, sessions, systemLogs, users } from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import type { TokenHasherError } from "../../security/token-hasher.ts";

type CurrentTimeMillis = () => Effect.Effect<number>;
type NowIso = () => Effect.Effect<string>;
type RandomHex = (bytes: number) => Effect.Effect<string>;

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
  hashToken: (token: string) => Effect.Effect<string, TokenHasherError>,
  userId: number,
  randomHex: RandomHex,
  nowIso: NowIso,
  currentTimeMillis: CurrentTimeMillis,
) {
  const token = yield* randomHex(32);
  const tokenHash = yield* hashToken(token);
  const now = yield* nowIso();
  const expiresAt = yield* expiresAtIso(durationDays, currentTimeMillis);

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
  nowIso: NowIso,
) {
  const now = yield* nowIso();
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

export const changePasswordState = Effect.fn("Auth.changePasswordState")(function* (input: {
  readonly db: AppDatabase;
  readonly changedAt: string;
  readonly passwordHash: string;
  readonly userId: number;
  readonly username: string;
}) {
  yield* tryDatabasePromise("Failed to update password", () =>
    input.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          mustChangePassword: false,
          passwordHash: input.passwordHash,
          updatedAt: input.changedAt,
        })
        .where(eq(users.id, input.userId));
      await tx.delete(sessions).where(eq(sessions.userId, input.userId));
      await tx.update(appConfig).set({ bootstrapPassword: null }).where(eq(appConfig.id, 1));
      await tx.insert(systemLogs).values({
        createdAt: input.changedAt,
        details: null,
        eventType: "auth.password.changed",
        level: "success",
        message: `${input.username} changed their password`,
      });
    }),
  );
});

export const regenerateApiKeyState = Effect.fn("Auth.regenerateApiKeyState")(function* (input: {
  readonly apiKeyHash: string;
  readonly db: AppDatabase;
  readonly regeneratedAt: string;
  readonly userId: number;
  readonly username: string;
}) {
  yield* tryDatabasePromise("Failed to regenerate API key", () =>
    input.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          apiKey: input.apiKeyHash,
          updatedAt: input.regeneratedAt,
        })
        .where(eq(users.id, input.userId));
      await tx.delete(sessions).where(eq(sessions.userId, input.userId));
      await tx.insert(systemLogs).values({
        createdAt: input.regeneratedAt,
        details: null,
        eventType: "auth.api_key.regenerated",
        level: "success",
        message: `${input.username} regenerated an API key`,
      });
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
          Effect.catchAllCause(() => Effect.succeed(false)),
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

export const expiresAtIso = Effect.fn("Auth.expiresAtIso")(function* (
  durationDays: number,
  currentTimeMillis: CurrentTimeMillis,
) {
  const now = yield* currentTimeMillis();
  return new Date(now + durationDays * DAY_MS).toISOString();
});
