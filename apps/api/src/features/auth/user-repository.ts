// oxlint-disable oxc/no-async-await -- async/await required by transaction callbacks, test callbacks, and tryPromise wrappers
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { and, eq, gt, lt } from "drizzle-orm";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { appConfig, sessions, systemLogs, users } from "@/db/schema.ts";
import { makeDbExecutor } from "@/infra/effect/db.ts";
import { Context, Effect, Layer, Option } from "effect";

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
  readonly pruneExpiredSessions: (now: string) => Effect.Effect<void, DatabaseError>;
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
  readonly updatePasswordHash: (input: {
    readonly passwordHash: string;
    readonly updatedAt: string;
    readonly userId: number;
  }) => Effect.Effect<void, DatabaseError>;
  readonly writeLog: (input: {
    readonly createdAt: string;
    readonly details?: string;
    readonly eventType: string;
    readonly level: string;
    readonly message: string;
  }) => Effect.Effect<void, DatabaseError>;
}

export class AuthUserRepository extends Context.Service<
  AuthUserRepository,
  AuthUserRepositoryShape
>()("@bakarr/api/AuthUserRepository") {
  static readonly layer = Layer.effect(
    AuthUserRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeAuthUserRepositoryShape(db, sqlClient);
    }),
  );
}

export function makeAuthUserRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): AuthUserRepositoryShape {
  const exec = makeDbExecutor(sqlClient);

  const findUserByUsername = Effect.fn("AuthUserRepository.findUserByUsername")(function* (
    username: string,
  ) {
    return yield* exec.queryFirst(
      "Failed to find user by username",
      db.select().from(users).where(eq(users.username, username)).limit(1).prepare().effect(),
    );
  });

  const findUserByApiKey = Effect.fn("AuthUserRepository.findUserByApiKey")(function* (
    apiKey: string,
  ) {
    return yield* exec.queryFirst(
      "Failed to find user by API key",
      db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1).prepare().effect(),
    );
  });

  const findUserById = Effect.fn("AuthUserRepository.findUserById")(function* (userId: number) {
    return yield* exec.queryFirst(
      "Failed to find user by ID",
      db.select().from(users).where(eq(users.id, userId)).limit(1).prepare().effect(),
    );
  });

  const findAnyUserId = Effect.fn("AuthUserRepository.findAnyUserId")(function* () {
    const row = yield* exec.queryFirst(
      "Failed to find user",
      db.select({ id: users.id }).from(users).limit(1).prepare().effect(),
    );
    return Option.map(row, (value) => value.id);
  });

  const changePasswordState = Effect.fn("AuthUserRepository.changePasswordState")(
    function* (input: {
      readonly changedAt: string;
      readonly apiKeyHash: string;
      readonly passwordHash: string;
      readonly userId: number;
      readonly username: string;
    }) {
      yield* exec.runTransaction(
        "Failed to update password",
        Effect.gen(function* () {
          yield* db
            .update(users)
            .set({
              apiKey: input.apiKeyHash,
              mustChangePassword: false,
              passwordHash: input.passwordHash,
              updatedAt: input.changedAt,
            })
            .where(eq(users.id, input.userId))
            .prepare()
            .effect();
          yield* db.delete(sessions).where(eq(sessions.userId, input.userId)).prepare().effect();
          yield* db
            .update(appConfig)
            .set({ bootstrapPassword: null })
            .where(eq(appConfig.id, 1))
            .prepare()
            .effect();
          yield* db
            .insert(systemLogs)
            .values({
              createdAt: input.changedAt,
              details: null,
              eventType: "auth.password.changed",
              level: "success",
              message: `${input.username} changed their password`,
            })
            .prepare()
            .effect();
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
      yield* exec.runTransaction(
        "Failed to regenerate API key",
        Effect.gen(function* () {
          yield* db
            .update(users)
            .set({
              apiKey: input.apiKeyHash,
              updatedAt: input.regeneratedAt,
            })
            .where(eq(users.id, input.userId))
            .prepare()
            .effect();
          yield* db.delete(sessions).where(eq(sessions.userId, input.userId)).prepare().effect();
          yield* db
            .insert(systemLogs)
            .values({
              createdAt: input.regeneratedAt,
              details: null,
              eventType: "auth.api_key.regenerated",
              level: "success",
              message: `${input.username} regenerated an API key`,
            })
            .prepare()
            .effect();
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
      yield* exec.runQuery(
        "Failed to ensure bootstrap user",
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
          .onConflictDoNothing()
          .prepare()
          .effect(),
      );
    },
  );

  const createSession = Effect.fn("AuthUserRepository.createSession")(function* (input: {
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly tokenHash: string;
    readonly userId: number;
  }) {
    yield* exec.runQuery(
      "Failed to create session",
      db
        .insert(sessions)
        .values({
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
          lastSeenAt: input.createdAt,
          token: input.tokenHash,
          userId: input.userId,
        })
        .prepare()
        .effect(),
    );
  });

  const resolveUserBySessionToken = Effect.fn("AuthUserRepository.resolveUserBySessionToken")(
    function* (tokenHash: string, now: string) {
      const sessionRow = yield* exec.queryFirst(
        "Failed to resolve the current user",
        db
          .select({ lastSeenAt: sessions.lastSeenAt, userId: sessions.userId })
          .from(sessions)
          .where(and(eq(sessions.token, tokenHash), gt(sessions.expiresAt, now)))
          .limit(1)
          .prepare()
          .effect(),
      );

      if (Option.isNone(sessionRow)) {
        return Option.none<AuthSessionUserRow>();
      }

      const userRow = yield* exec.queryFirst(
        "Failed to resolve the current user",
        db
          .select({
            createdAt: users.createdAt,
            id: users.id,
            mustChangePassword: users.mustChangePassword,
            updatedAt: users.updatedAt,
            username: users.username,
          })
          .from(users)
          .where(eq(users.id, sessionRow.value.userId))
          .limit(1)
          .prepare()
          .effect(),
      );

      if (
        Option.isNone(userRow) ||
        sessionRow.value.lastSeenAt === undefined ||
        userRow.value.createdAt === undefined
      ) {
        return Option.none<AuthSessionUserRow>();
      }

      const row = {
        createdAt: userRow.value.createdAt,
        id: userRow.value.id,
        lastSeenAt: sessionRow.value.lastSeenAt,
        mustChangePassword: userRow.value.mustChangePassword,
        updatedAt: userRow.value.updatedAt,
        username: userRow.value.username,
      };

      return Option.some(row);
    },
  );

  const refreshSession = Effect.fn("AuthUserRepository.refreshSession")(function* (input: {
    readonly expiresAt: string;
    readonly lastSeenAt: string;
    readonly tokenHash: string;
  }) {
    yield* exec.runQuery(
      "Failed to resolve the current user",
      db
        .update(sessions)
        .set({
          expiresAt: input.expiresAt,
          lastSeenAt: input.lastSeenAt,
        })
        .where(eq(sessions.token, input.tokenHash))
        .prepare()
        .effect(),
    );
  });

  const deleteSession = Effect.fn("AuthUserRepository.deleteSession")(function* (
    tokenHash: string,
  ) {
    yield* exec.runQuery(
      "Failed to clear the active session",
      db.delete(sessions).where(eq(sessions.token, tokenHash)).prepare().effect(),
    );
  });

  const pruneExpiredSessions = Effect.fn("AuthUserRepository.pruneExpiredSessions")(function* (
    now: string,
  ) {
    yield* exec.runQuery(
      "Failed to prune expired sessions",
      db.delete(sessions).where(lt(sessions.expiresAt, now)).prepare().effect(),
    );
  });

  const updatePasswordHash = Effect.fn("AuthUserRepository.updatePasswordHash")(function* (input: {
    readonly passwordHash: string;
    readonly updatedAt: string;
    readonly userId: number;
  }) {
    yield* exec.runQuery(
      "Failed to update password hash",
      db
        .update(users)
        .set({ passwordHash: input.passwordHash, updatedAt: input.updatedAt })
        .where(eq(users.id, input.userId))
        .prepare()
        .effect(),
    );
  });

  const writeLog = Effect.fn("AuthUserRepository.writeLog")(function* (input: {
    readonly createdAt: string;
    readonly details?: string;
    readonly eventType: string;
    readonly level: string;
    readonly message: string;
  }) {
    yield* exec.runQuery(
      "Failed to write log",
      db
        .insert(systemLogs)
        .values({
          createdAt: input.createdAt,
          details: input.details ?? null,
          eventType: input.eventType,
          level: input.level,
          message: input.message,
        })
        .prepare()
        .effect(),
    );
  });

  return {
    changePasswordState,
    createBootstrapUser,
    createSession,
    deleteSession,
    findAnyUserId,
    findUserByApiKey,
    findUserById,
    findUserByUsername,
    pruneExpiredSessions,
    regenerateApiKeyState,
    refreshSession,
    resolveUserBySessionToken,
    updatePasswordHash,
    writeLog,
  } satisfies AuthUserRepositoryShape;
}
