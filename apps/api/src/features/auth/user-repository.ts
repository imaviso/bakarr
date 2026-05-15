import { and, eq, gt } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";

import { Database, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { appConfig, sessions, systemLogs, users } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export type AuthUserRow = typeof users.$inferSelect;

export interface AuthSessionUserRow {
  readonly createdAt: string;
  readonly id: number;
  readonly lastSeenAt: string;
  readonly mustChangePassword: boolean;
  readonly updatedAt: string;
  readonly username: string;
}

export interface AuthUserRepositoryShape {
  readonly changePasswordState: (input: {
    readonly changedAt: string;
    readonly apiKeyHash: string;
    readonly passwordHash: string;
    readonly userId: number;
    readonly username: string;
  }) => Effect.Effect<void, DatabaseError>;
  readonly createBootstrapUser: (input: {
    readonly apiKeyHash: string;
    readonly createdAt: string;
    readonly passwordHash: string;
    readonly username: string;
  }) => Effect.Effect<void, DatabaseError>;
  readonly createSession: (input: {
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly tokenHash: string;
    readonly userId: number;
  }) => Effect.Effect<void, DatabaseError>;
  readonly deleteSession: (tokenHash: string) => Effect.Effect<void, DatabaseError>;
  readonly findAnyUserId: () => Effect.Effect<Option.Option<number>, DatabaseError>;
  readonly findUserByApiKey: (
    apiKey: string,
  ) => Effect.Effect<Option.Option<AuthUserRow>, DatabaseError>;
  readonly findUserById: (
    userId: number,
  ) => Effect.Effect<Option.Option<AuthUserRow>, DatabaseError>;
  readonly findUserByUsername: (
    username: string,
  ) => Effect.Effect<Option.Option<AuthUserRow>, DatabaseError>;
  readonly regenerateApiKeyState: (input: {
    readonly apiKeyHash: string;
    readonly regeneratedAt: string;
    readonly userId: number;
    readonly username: string;
  }) => Effect.Effect<void, DatabaseError>;
  readonly resolveUserBySessionToken: (
    tokenHash: string,
    now: string,
  ) => Effect.Effect<Option.Option<AuthSessionUserRow>, DatabaseError>;
  readonly refreshSession: (input: {
    readonly expiresAt: string;
    readonly lastSeenAt: string;
    readonly tokenHash: string;
  }) => Effect.Effect<void, DatabaseError>;
  readonly writeLog: (input: {
    readonly createdAt: string;
    readonly details?: string;
    readonly eventType: string;
    readonly level: string;
    readonly message: string;
  }) => Effect.Effect<void, DatabaseError>;
}

export class AuthUserRepository extends Context.Tag("@bakarr/api/AuthUserRepository")<
  AuthUserRepository,
  AuthUserRepositoryShape
>() {}

export function makeAuthUserRepository(db: AppDatabase): AuthUserRepositoryShape {
  const findUserByUsername = Effect.fn("AuthUserRepository.findUserByUsername")(function* (
    username: string,
  ) {
    const rows = yield* tryDatabasePromise("Failed to find user by username", () =>
      db.select().from(users).where(eq(users.username, username)).limit(1),
    );
    return Option.fromNullable(rows[0]);
  });

  const findUserByApiKey = Effect.fn("AuthUserRepository.findUserByApiKey")(function* (
    apiKey: string,
  ) {
    const rows = yield* tryDatabasePromise("Failed to find user by API key", () =>
      db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1),
    );
    return Option.fromNullable(rows[0]);
  });

  const findUserById = Effect.fn("AuthUserRepository.findUserById")(function* (userId: number) {
    const rows = yield* tryDatabasePromise("Failed to find user by ID", () =>
      db.select().from(users).where(eq(users.id, userId)).limit(1),
    );
    return Option.fromNullable(rows[0]);
  });

  const findAnyUserId = Effect.fn("AuthUserRepository.findAnyUserId")(function* () {
    const rows = yield* tryDatabasePromise("Failed to find user", () =>
      db.select({ id: users.id }).from(users).limit(1),
    );
    return Option.fromNullable(rows[0]?.id);
  });

  const changePasswordState = Effect.fn("AuthUserRepository.changePasswordState")(
    function* (input: {
      readonly changedAt: string;
      readonly apiKeyHash: string;
      readonly passwordHash: string;
      readonly userId: number;
      readonly username: string;
    }) {
      yield* tryDatabasePromise("Failed to update password", () =>
        db.transaction(async (tx) => {
          await tx
            .update(users)
            .set({
              apiKey: input.apiKeyHash,
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

  const regenerateApiKeyState = Effect.fn("AuthUserRepository.regenerateApiKeyState")(
    function* (input: {
      readonly apiKeyHash: string;
      readonly regeneratedAt: string;
      readonly userId: number;
      readonly username: string;
    }) {
      yield* tryDatabasePromise("Failed to regenerate API key", () =>
        db.transaction(async (tx) => {
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

  const createBootstrapUser = Effect.fn("AuthUserRepository.createBootstrapUser")(
    function* (input: {
      readonly apiKeyHash: string;
      readonly createdAt: string;
      readonly passwordHash: string;
      readonly username: string;
    }) {
      yield* tryDatabasePromise("Failed to ensure bootstrap user", () =>
        db
          .insert(users)
          .values({
            apiKey: input.apiKeyHash,
            createdAt: input.createdAt,
            mustChangePassword: true,
            passwordHash: input.passwordHash,
            updatedAt: input.createdAt,
            username: input.username,
          })
          .onConflictDoNothing(),
      );
    },
  );

  const createSession = Effect.fn("AuthUserRepository.createSession")(function* (input: {
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly tokenHash: string;
    readonly userId: number;
  }) {
    yield* tryDatabasePromise("Failed to create session", () =>
      db.insert(sessions).values({
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        lastSeenAt: input.createdAt,
        token: input.tokenHash,
        userId: input.userId,
      }),
    );
  });

  const resolveUserBySessionToken = Effect.fn("AuthUserRepository.resolveUserBySessionToken")(
    function* (tokenHash: string, now: string) {
      const rows = yield* tryDatabasePromise("Failed to resolve the current user", () =>
        db
          .select({
            createdAt: users.createdAt,
            id: users.id,
            lastSeenAt: sessions.lastSeenAt,
            mustChangePassword: users.mustChangePassword,
            updatedAt: users.updatedAt,
            username: users.username,
          })
          .from(sessions)
          .innerJoin(users, eq(users.id, sessions.userId))
          .where(and(eq(sessions.token, tokenHash), gt(sessions.expiresAt, now)))
          .limit(1),
      );

      const row = rows[0];
      if (!row || row.lastSeenAt === undefined || row.createdAt === undefined) {
        return Option.none<AuthSessionUserRow>();
      }

      return Option.some(row);
    },
  );

  const refreshSession = Effect.fn("AuthUserRepository.refreshSession")(function* (input: {
    readonly expiresAt: string;
    readonly lastSeenAt: string;
    readonly tokenHash: string;
  }) {
    yield* tryDatabasePromise("Failed to resolve the current user", () =>
      db
        .update(sessions)
        .set({
          expiresAt: input.expiresAt,
          lastSeenAt: input.lastSeenAt,
        })
        .where(eq(sessions.token, input.tokenHash)),
    );
  });

  const deleteSession = Effect.fn("AuthUserRepository.deleteSession")(function* (
    tokenHash: string,
  ) {
    yield* tryDatabasePromise("Failed to clear the active session", () =>
      db.delete(sessions).where(eq(sessions.token, tokenHash)),
    );
  });

  const writeLog = Effect.fn("AuthUserRepository.writeLog")(function* (input: {
    readonly createdAt: string;
    readonly details?: string;
    readonly eventType: string;
    readonly level: string;
    readonly message: string;
  }) {
    yield* tryDatabasePromise("Failed to write log", () =>
      db.insert(systemLogs).values({
        createdAt: input.createdAt,
        details: input.details ?? null,
        eventType: input.eventType,
        level: input.level,
        message: input.message,
      }),
    );
  });

  return AuthUserRepository.of({
    changePasswordState,
    createBootstrapUser,
    createSession,
    deleteSession,
    findAnyUserId,
    findUserByApiKey,
    findUserById,
    findUserByUsername,
    regenerateApiKeyState,
    refreshSession,
    resolveUserBySessionToken,
    writeLog,
  });
}

export const AuthUserRepositoryLive = Layer.effect(
  AuthUserRepository,
  Effect.gen(function* () {
    const { db } = yield* Database;
    return makeAuthUserRepository(db);
  }),
);
