import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { appConfig, sessions, systemLogs, users } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export const findUserByUsername = Effect.fn("AuthUserRepository.findUserByUsername")(function* (
  db: AppDatabase,
  username: string,
) {
  const rows = yield* tryDatabasePromise("Failed to find user by username", () =>
    db.select().from(users).where(eq(users.username, username)).limit(1),
  );
  return rows[0] ?? null;
});

export const findUserByApiKey = Effect.fn("AuthUserRepository.findUserByApiKey")(function* (
  db: AppDatabase,
  apiKey: string,
) {
  const rows = yield* tryDatabasePromise("Failed to find user by API key", () =>
    db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1),
  );
  return rows[0] ?? null;
});

export const findUserById = Effect.fn("AuthUserRepository.findUserById")(function* (
  db: AppDatabase,
  userId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to find user by ID", () =>
    db.select().from(users).where(eq(users.id, userId)).limit(1),
  );
  return rows[0] ?? null;
});

export const changePasswordState = Effect.fn("AuthUserRepository.changePasswordState")(
  function* (input: {
    readonly changedAt: string;
    readonly db: AppDatabase;
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
  },
);

export const regenerateApiKeyState = Effect.fn("AuthUserRepository.regenerateApiKeyState")(
  function* (input: {
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
  },
);
