import { and, eq, gt } from "drizzle-orm";
import { Context, Effect, Layer, Redacted, Schema } from "effect";

import type {
  ApiKeyLoginRequest,
  ApiKeyResponse,
  AuthUser,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
} from "../../../../../packages/shared/src/index.ts";
import { AppConfig } from "../../config.ts";
import {
  type AppDatabase,
  Database,
  DatabaseError,
} from "../../db/database.ts";
import { sessions, systemLogs, users } from "../../db/schema.ts";
import { hashPassword, verifyPassword } from "../../security/password.ts";

export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  message: Schema.String,
  status: Schema.Literal(400, 401, 404, 409),
}) {}

export interface SessionIdentity {
  readonly token: string;
  readonly user: AuthUser;
}

export interface AuthServiceShape {
  readonly ensureBootstrapUser: () => Effect.Effect<void, DatabaseError>;
  readonly login: (
    request: LoginRequest,
  ) => Effect.Effect<
    SessionIdentity & { response: LoginResponse },
    AuthError | DatabaseError
  >;
  readonly loginWithApiKey: (
    request: ApiKeyLoginRequest,
  ) => Effect.Effect<
    SessionIdentity & { response: LoginResponse },
    AuthError | DatabaseError
  >;
  readonly resolveViewer: (
    sessionToken: string | undefined,
    apiKey: string | undefined,
  ) => Effect.Effect<AuthUser | null, DatabaseError>;
  readonly logout: (
    sessionToken: string | undefined,
  ) => Effect.Effect<void, DatabaseError>;
  readonly changePassword: (
    userId: number,
    request: ChangePasswordRequest,
  ) => Effect.Effect<void, AuthError | DatabaseError>;
  readonly getApiKey: (
    userId: number,
  ) => Effect.Effect<ApiKeyResponse, AuthError | DatabaseError>;
  readonly regenerateApiKey: (
    userId: number,
  ) => Effect.Effect<ApiKeyResponse, AuthError | DatabaseError>;
}

export class AuthService extends Context.Tag("@bakarr/api/AuthService")<
  AuthService,
  AuthServiceShape
>() {}

const DAY_MS = 24 * 60 * 60 * 1000;

const makeAuthService = Effect.gen(function* () {
  const { db } = yield* Database;
  const config = yield* AppConfig;

  const ensureBootstrapUser = Effect.fn("AuthService.ensureBootstrapUser")(
    function* () {
      const existing = yield* tryDatabasePromise(
        "Failed to ensure bootstrap user",
        () => db.select({ id: users.id }).from(users).limit(1),
      );

      if (existing.length > 0) {
        return;
      }

      const now = nowIso();
      const passwordHash = yield* tryDatabasePromise(
        "Failed to ensure bootstrap user",
        () => hashPassword(Redacted.value(config.bootstrapPassword)),
      );

      const rawApiKey = randomHex(24);
      const hashedApiKey = yield* tryDatabasePromise(
        "Failed to ensure bootstrap user",
        () => hashToken(rawApiKey),
      );

      yield* tryDatabasePromise(
        "Failed to ensure bootstrap user",
        () =>
          db.insert(users).values({
            apiKey: hashedApiKey,
            createdAt: now,
            mustChangePassword: true,
            passwordHash,
            updatedAt: now,
            username: config.bootstrapUsername,
          }),
      );

      yield* tryDatabasePromise(
        "Failed to ensure bootstrap user",
        () =>
          writeLog(db, {
            eventType: "bootstrap.user.created",
            level: "success",
            message: `Bootstrap user '${config.bootstrapUsername}' created`,
          }),
      );
    },
  );

  const login = Effect.fn("AuthService.login")(function* (
    request: LoginRequest,
  ) {
    const row = yield* tryAuthPromise(
      "Failed to complete login",
      () => findUserByUsername(db, request.username),
    );

    if (!row) {
      return yield* AuthError.make({
        message: "Invalid username or password",
        status: 401,
      });
    }

    const verified = yield* tryAuthPromise(
      "Failed to complete login",
      () => verifyPassword(request.password, row.passwordHash),
    );

    if (!verified) {
      return yield* AuthError.make({
        message: "Invalid username or password",
        status: 401,
      });
    }

    const userRow = row!;
    const token = yield* tryAuthPromise(
      "Failed to complete login",
      () => createSession(db, config.sessionDurationDays, userRow.id),
    );

    yield* tryDatabasePromise("Failed to complete login", () =>
      writeLog(db, {
        eventType: "auth.login",
        level: "success",
        message: `${userRow.username} signed in`,
      }));

    return {
      response: {
        api_key: "************************",
        must_change_password: userRow.mustChangePassword,
        username: userRow.username,
      },
      token,
      user: toAuthUser(userRow),
    };
  });

  const loginWithApiKey = Effect.fn("AuthService.loginWithApiKey")(function* (
    request: ApiKeyLoginRequest,
  ) {
    const hashedApiKey = yield* tryAuthPromise(
      "Failed to hash API key",
      () => hashToken(request.api_key),
    );

    const row = yield* tryAuthPromise(
      "Failed to complete API key login",
      () => findUserByApiKey(db, hashedApiKey),
    );

    if (!row) {
      return yield* AuthError.make({ message: "Invalid API key", status: 401 });
    }

    const userRow = row!;
    const token = yield* tryAuthPromise(
      "Failed to complete API key login",
      () => createSession(db, config.sessionDurationDays, userRow.id),
    );

    yield* tryDatabasePromise(
      "Failed to complete API key login",
      () =>
        writeLog(db, {
          eventType: "auth.login.api_key",
          level: "success",
          message: `${userRow.username} signed in with an API key`,
        }),
    );

    return {
      response: {
        api_key: "************************",
        must_change_password: userRow.mustChangePassword,
        username: userRow.username,
      },
      token,
      user: toAuthUser(userRow),
    };
  });

  const resolveViewer = Effect.fn("AuthService.resolveViewer")(function* (
    sessionToken: string | undefined,
    apiKey: string | undefined,
  ) {
    if (sessionToken) {
      const hashedSessionToken = yield* tryDatabasePromise(
        "Failed to hash session token",
        () => hashToken(sessionToken),
      );

      const result = yield* tryDatabasePromise(
        "Failed to resolve the current user",
        () =>
          db
            .select({
              createdAt: users.createdAt,
              id: users.id,
              updatedAt: users.updatedAt,
              username: users.username,
            })
            .from(sessions)
            .innerJoin(users, eq(users.id, sessions.userId))
            .where(
              and(
                eq(sessions.token, hashedSessionToken),
                gt(sessions.expiresAt, nowIso()),
              ),
            )
            .limit(1),
      );

      if (result[0]) {
        yield* tryDatabasePromise("Failed to resolve the current user", () =>
          db
            .update(sessions)
            .set({
              expiresAt: expiresAtIso(config.sessionDurationDays),
              lastSeenAt: nowIso(),
            })
            .where(eq(sessions.token, hashedSessionToken)));

        return {
          created_at: result[0].createdAt,
          id: result[0].id,
          updated_at: result[0].updatedAt,
          username: result[0].username,
        };
      }
    }

    if (!apiKey) {
      return null;
    }

    const hashedApiKey = yield* tryDatabasePromise(
      "Failed to hash API key",
      () => hashToken(apiKey),
    );

    const row = yield* tryDatabasePromise(
      "Failed to resolve the current user",
      () => findUserByApiKey(db, hashedApiKey),
    );

    return row ? toAuthUser(row) : null;
  });

  const logout = Effect.fn("AuthService.logout")(function* (
    sessionToken: string | undefined,
  ) {
    if (!sessionToken) {
      return;
    }

    const hashedSessionToken = yield* tryDatabasePromise(
      "Failed to hash session token",
      () => hashToken(sessionToken),
    );

    yield* tryDatabasePromise(
      "Failed to clear the active session",
      () => db.delete(sessions).where(eq(sessions.token, hashedSessionToken)),
    );
  });

  const changePassword = Effect.fn("AuthService.changePassword")(function* (
    userId: number,
    request: ChangePasswordRequest,
  ) {
    const row = yield* tryAuthPromise(
      "Failed to update password",
      () => findUserById(db, userId),
    );

    if (!row) {
      return yield* AuthError.make({ message: "User not found", status: 404 });
    }

    const userRow = row!;
    const verified = yield* tryAuthPromise(
      "Failed to update password",
      () => verifyPassword(request.current_password, userRow.passwordHash),
    );

    if (!verified) {
      return yield* AuthError.make({
        message: "Current password is incorrect",
        status: 401,
      });
    }

    const passwordHash = yield* tryAuthPromise(
      "Failed to update password",
      () => hashPassword(request.new_password),
    );

    yield* tryAuthPromise("Failed to update password", () =>
      db
        .update(users)
        .set({
          mustChangePassword: false,
          passwordHash,
          updatedAt: nowIso(),
        })
        .where(eq(users.id, userId)));

    yield* tryDatabasePromise("Failed to update password", () =>
      writeLog(db, {
        eventType: "auth.password.changed",
        level: "success",
        message: `${userRow.username} changed their password`,
      }));
  });

  const getApiKey = Effect.fn("AuthService.getApiKey")(function* (
    userId: number,
  ) {
    const row = yield* tryAuthPromise(
      "Failed to read API key",
      () => findUserById(db, userId),
    );

    if (!row) {
      return yield* AuthError.make({ message: "User not found", status: 404 });
    }

    return { api_key: "************************" };
  });

  const regenerateApiKey = Effect.fn("AuthService.regenerateApiKey")(
    function* (userId: number) {
      const row = yield* tryAuthPromise(
        "Failed to regenerate API key",
        () => findUserById(db, userId),
      );

      if (!row) {
        return yield* AuthError.make({
          message: "User not found",
          status: 404,
        });
      }

      const userRow = row!;
      const apiKey = randomHex(24);
      const hashedApiKey = yield* tryAuthPromise(
        "Failed to hash API key",
        () => hashToken(apiKey),
      );

      yield* tryAuthPromise("Failed to regenerate API key", () =>
        db
          .update(users)
          .set({
            apiKey: hashedApiKey,
            updatedAt: nowIso(),
          })
          .where(eq(users.id, userId)));

      yield* tryDatabasePromise(
        "Failed to regenerate API key",
        () =>
          writeLog(db, {
            eventType: "auth.api_key.regenerated",
            level: "success",
            message: `${userRow.username} regenerated an API key`,
          }),
      );

      return { api_key: apiKey };
    },
  );

  return {
    ensureBootstrapUser,
    login,
    loginWithApiKey,
    resolveViewer,
    logout,
    changePassword,
    getApiKey,
    regenerateApiKey,
  } satisfies AuthServiceShape;
});

export const AuthServiceLive = Layer.effect(AuthService, makeAuthService);

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    created_at: row.createdAt,
    id: row.id,
    updated_at: row.updatedAt,
    username: row.username,
  };
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function findUserByUsername(db: AppDatabase, username: string) {
  const rows = await db.select().from(users).where(eq(users.username, username))
    .limit(1);
  return rows[0] ?? null;
}

async function findUserByApiKey(db: AppDatabase, apiKey: string) {
  const rows = await db.select().from(users).where(eq(users.apiKey, apiKey))
    .limit(1);
  return rows[0] ?? null;
}

async function findUserById(db: AppDatabase, userId: number) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(
    1,
  );
  return rows[0] ?? null;
}

async function createSession(
  db: AppDatabase,
  durationDays: number,
  userId: number,
) {
  const token = randomHex(32);
  const tokenHash = await hashToken(token);
  const now = nowIso();

  await db.insert(sessions).values({
    createdAt: now,
    expiresAt: expiresAtIso(durationDays),
    lastSeenAt: now,
    token: tokenHash,
    userId,
  });

  return token;
}

function expiresAtIso(durationDays: number) {
  return new Date(Date.now() + durationDays * DAY_MS).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function randomHex(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (entry) => entry.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function writeLog(
  db: AppDatabase,
  input: {
    eventType: string;
    level: string;
    message: string;
    details?: string;
  },
) {
  await db.insert(systemLogs).values({
    createdAt: nowIso(),
    details: input.details ?? null,
    eventType: input.eventType,
    level: input.level,
    message: input.message,
  });
}

function asAuthError(message: string) {
  return (cause: unknown) => {
    if (cause instanceof AuthError || cause instanceof DatabaseError) {
      return cause;
    }

    return new DatabaseError({ cause, message });
  };
}

function tryDatabasePromise<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, DatabaseError> {
  return Effect.tryPromise({
    try: try_,
    catch: (cause) => new DatabaseError({ cause, message }),
  });
}

function tryAuthPromise<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, AuthError | DatabaseError> {
  return Effect.tryPromise({
    try: try_,
    catch: asAuthError(message),
  });
}
