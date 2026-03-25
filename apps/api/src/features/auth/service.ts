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
import { Database, DatabaseError } from "../../db/database.ts";
import { appConfig, sessions, systemLogs, users } from "../../db/schema.ts";
import { toDatabaseError, tryDatabasePromise } from "../../lib/effect-db.ts";
import { hashPassword, verifyPassword } from "../../security/password.ts";
import {
  announceBootstrapCredentials,
  createSession,
  expiresAtIso,
  findUserByApiKey,
  findUserById,
  findUserByUsername,
  hashToken,
  nowIso,
  randomHex,
  writeLog,
} from "./service-support.ts";

export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  message: Schema.String,
  status: Schema.Literal(400, 401, 403, 404, 409),
}) {}

export interface SessionIdentity {
  readonly token: string;
  readonly user: AuthUser;
}

export interface AuthServiceShape {
  readonly ensureBootstrapUser: () => Effect.Effect<void, DatabaseError>;
  readonly login: (
    request: LoginRequest,
  ) => Effect.Effect<SessionIdentity & { response: LoginResponse }, AuthError | DatabaseError>;
  readonly loginWithApiKey: (
    request: ApiKeyLoginRequest,
  ) => Effect.Effect<SessionIdentity & { response: LoginResponse }, AuthError | DatabaseError>;
  readonly resolveViewer: (
    sessionToken: string | undefined,
    apiKey: string | undefined,
  ) => Effect.Effect<AuthUser | null, DatabaseError>;
  readonly logout: (sessionToken: string | undefined) => Effect.Effect<void, DatabaseError>;
  readonly changePassword: (
    userId: number,
    request: ChangePasswordRequest,
  ) => Effect.Effect<void, AuthError | DatabaseError>;
  readonly getApiKey: (userId: number) => Effect.Effect<ApiKeyResponse, AuthError | DatabaseError>;
  readonly regenerateApiKey: (
    userId: number,
  ) => Effect.Effect<ApiKeyResponse, AuthError | DatabaseError>;
}

export class AuthService extends Context.Tag("@bakarr/api/AuthService")<
  AuthService,
  AuthServiceShape
>() {}

const makeAuthService = Effect.gen(function* () {
  const { db } = yield* Database;
  const config = yield* AppConfig;

  /**
   * Bootstrap user lifecycle (one-way transition):
   *
   * 1. On first run (no users in DB), creates an admin user with:
   *    - username/password from env config (BOOTSTRAP_USERNAME/PASSWORD)
   *    - `mustChangePassword: true` — UI forces a password change on first login
   *    - a generated API key
   *    - credentials printed to stdout so the operator can log in
   *
   * 2. When the user changes their password via {@link changePassword}:
   *    - `mustChangePassword` is set to `false`
   *    - all sessions are invalidated (forces re-login with new password)
   *    - `bootstrapPassword` is nulled in the appConfig table
   *    This is a ONE-WAY transition: the bootstrap password is permanently
   *    erased from the database. Re-running ensureBootstrapUser after this
   *    point is a no-op because a user already exists.
   *
   * 3. Idempotency: if any user row exists, this function returns immediately.
   *    The `onConflictDoNothing()` guard prevents duplicate inserts even under
   *    concurrent startup races.
   */
  const ensureBootstrapUser = Effect.fn("AuthService.ensureBootstrapUser")(function* () {
    const existing = yield* tryDatabasePromise("Failed to ensure bootstrap user", () =>
      db.select({ id: users.id }).from(users).limit(1),
    );

    if (existing.length > 0) {
      return;
    }

    const bootstrapPassword = Redacted.value(config.bootstrapPassword);

    const now = yield* nowIso;
    const passwordHash = yield* hashPassword(bootstrapPassword).pipe(
      Effect.mapError((error) =>
        toDatabaseError(`Failed to hash password: ${error.message}`)(error.cause),
      ),
    );

    const rawApiKey = yield* randomHex(24);
    const hashedApiKey = yield* hashToken(rawApiKey);

    yield* tryDatabasePromise("Failed to ensure bootstrap user", () =>
      db
        .insert(users)
        .values({
          apiKey: hashedApiKey,
          createdAt: now,
          mustChangePassword: true,
          passwordHash,
          updatedAt: now,
          username: config.bootstrapUsername,
        })
        .onConflictDoNothing(),
    );

    yield* writeLog(db, {
      eventType: "bootstrap.user.created",
      level: "success",
      message: `Bootstrap user '${config.bootstrapUsername}' created`,
    });

    yield* announceBootstrapCredentials({
      username: config.bootstrapUsername,
      password: bootstrapPassword,
    });
  });

  const login = Effect.fn("AuthService.login")(function* (request: LoginRequest) {
    const row = yield* findUserByUsername(db, request.username);

    if (!row) {
      return yield* AuthError.make({
        message: "Invalid username or password",
        status: 401,
      });
    }

    const verified = yield* verifyPassword(request.password, row.passwordHash).pipe(
      Effect.mapError((error) =>
        toDatabaseError(`Failed to verify password: ${error.message}`)(error),
      ),
    );

    if (!verified) {
      return yield* AuthError.make({
        message: "Invalid username or password",
        status: 401,
      });
    }

    const userRow = row;
    const token = yield* createSession(db, config.sessionDurationDays, userRow.id);

    yield* writeLog(db, {
      eventType: "auth.login",
      level: "success",
      message: `${userRow.username} signed in`,
    });

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
    const hashedApiKey = yield* hashToken(request.api_key);

    const row = yield* findUserByApiKey(db, hashedApiKey);

    if (!row) {
      return yield* AuthError.make({ message: "Invalid API key", status: 401 });
    }

    const userRow = row;
    const token = yield* createSession(db, config.sessionDurationDays, userRow.id);

    yield* writeLog(db, {
      eventType: "auth.login.api_key",
      level: "success",
      message: `${userRow.username} signed in with an API key`,
    });

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
      const hashedSessionToken = yield* hashToken(sessionToken);
      const sessionNow = yield* nowIso;

      const result = yield* tryDatabasePromise("Failed to resolve the current user", () =>
        db
          .select({
            createdAt: users.createdAt,
            id: users.id,
            mustChangePassword: users.mustChangePassword,
            updatedAt: users.updatedAt,
            username: users.username,
          })
          .from(sessions)
          .innerJoin(users, eq(users.id, sessions.userId))
          .where(and(eq(sessions.token, hashedSessionToken), gt(sessions.expiresAt, sessionNow)))
          .limit(1),
      );

      if (result[0]) {
        const expiresAt = yield* expiresAtIso(config.sessionDurationDays);
        yield* tryDatabasePromise("Failed to resolve the current user", () =>
          db
            .update(sessions)
            .set({
              expiresAt,
              lastSeenAt: sessionNow,
            })
            .where(eq(sessions.token, hashedSessionToken)),
        );

        return {
          created_at: result[0].createdAt,
          id: result[0].id,
          must_change_password: result[0].mustChangePassword,
          updated_at: result[0].updatedAt,
          username: result[0].username,
        };
      }
    }

    if (!apiKey) {
      return null;
    }

    const hashedApiKey = yield* hashToken(apiKey);

    const row = yield* findUserByApiKey(db, hashedApiKey);

    return row ? toAuthUser(row) : null;
  });

  const logout = Effect.fn("AuthService.logout")(function* (sessionToken: string | undefined) {
    if (!sessionToken) {
      return;
    }

    const hashedSessionToken = yield* hashToken(sessionToken);

    yield* tryDatabasePromise("Failed to clear the active session", () =>
      db.delete(sessions).where(eq(sessions.token, hashedSessionToken)),
    );
  });

  const changePassword = Effect.fn("AuthService.changePassword")(function* (
    userId: number,
    request: ChangePasswordRequest,
  ) {
    const row = yield* findUserById(db, userId);

    if (!row) {
      return yield* AuthError.make({ message: "User not found", status: 404 });
    }

    const userRow = row;
    const verified = yield* verifyPassword(request.current_password, userRow.passwordHash).pipe(
      Effect.mapError((error) =>
        toDatabaseError(`Failed to verify password: ${error.message}`)(error),
      ),
    );

    if (!verified) {
      return yield* AuthError.make({
        message: "Current password is incorrect",
        status: 401,
      });
    }

    if (!request.new_password || request.new_password.length < 8) {
      return yield* AuthError.make({
        message: "New password must be at least 8 characters",
        status: 400,
      });
    }

    const passwordHash = yield* hashPassword(request.new_password).pipe(
      Effect.mapError((error) =>
        toDatabaseError(`Failed to hash password: ${error.message}`)(error.cause),
      ),
    );

    // One-way bootstrap transition: password change clears mustChangePassword,
    // invalidates all sessions, and permanently nulls the bootstrap password
    // from the appConfig table. See ensureBootstrapUser for lifecycle docs.
    const changeNow = yield* nowIso;
    yield* tryDatabasePromise("Failed to update password", () =>
      db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            mustChangePassword: false,
            passwordHash,
            updatedAt: changeNow,
          })
          .where(eq(users.id, userId));
        await tx.delete(sessions).where(eq(sessions.userId, userId));
        await tx.update(appConfig).set({ bootstrapPassword: null }).where(eq(appConfig.id, 1));
        await tx.insert(systemLogs).values({
          createdAt: changeNow,
          details: null,
          eventType: "auth.password.changed",
          level: "success",
          message: `${userRow.username} changed their password`,
        });
      }),
    );
  });

  const getApiKey = Effect.fn("AuthService.getApiKey")(function* (userId: number) {
    const row = yield* findUserById(db, userId);

    if (!row) {
      return yield* AuthError.make({ message: "User not found", status: 404 });
    }

    return { api_key: "************************" };
  });

  const regenerateApiKey = Effect.fn("AuthService.regenerateApiKey")(function* (userId: number) {
    const row = yield* findUserById(db, userId);

    if (!row) {
      return yield* AuthError.make({
        message: "User not found",
        status: 404,
      });
    }

    const userRow = row;
    const apiKey = yield* randomHex(24);
    const hashedApiKey = yield* hashToken(apiKey);
    const regenNow = yield* nowIso;

    yield* tryDatabasePromise("Failed to regenerate API key", () =>
      db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            apiKey: hashedApiKey,
            updatedAt: regenNow,
          })
          .where(eq(users.id, userId));
        await tx.delete(sessions).where(eq(sessions.userId, userId));
        await tx.insert(systemLogs).values({
          createdAt: regenNow,
          details: null,
          eventType: "auth.api_key.regenerated",
          level: "success",
          message: `${userRow.username} regenerated an API key`,
        });
      }),
    );

    return { api_key: apiKey };
  });

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
    must_change_password: row.mustChangePassword,
    updated_at: row.updatedAt,
    username: row.username,
  };
}
