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
import { appConfig, sessions, systemLogs, users } from "../../db/schema.ts";
import { toDatabaseError, tryDatabasePromise } from "../../lib/effect-db.ts";
import { hashPassword, verifyPassword } from "../../security/password.ts";

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

      let bootstrapPassword: string;

      if (config.bootstrapPasswordIsEnvOverride) {
        bootstrapPassword = Redacted.value(config.bootstrapPassword);
      } else {
        const storedRow = yield* tryDatabasePromise(
          "Failed to ensure bootstrap user",
          () =>
            db.select({ bootstrapPassword: appConfig.bootstrapPassword })
              .from(appConfig)
              .where(eq(appConfig.id, 1))
              .limit(1),
        );
        const stored = storedRow[0]?.bootstrapPassword ?? null;

        if (stored) {
          bootstrapPassword = stored;
        } else {
          bootstrapPassword = Redacted.value(config.bootstrapPassword);
          yield* tryDatabasePromise(
            "Failed to ensure bootstrap user",
            () =>
              db.insert(appConfig).values({
                bootstrapPassword,
                data: "{}",
                id: 1,
                updatedAt: nowIso(),
              }).onConflictDoUpdate({
                target: appConfig.id,
                set: { bootstrapPassword },
              }),
          );
        }
      }

      const now = nowIso();
      const passwordHash = yield* hashPassword(bootstrapPassword).pipe(
        Effect.mapError((error) =>
          toDatabaseError(`Failed to hash password: ${error.message}`)(
            error.cause,
          )
        ),
      );

      const rawApiKey = randomHex(24);
      const hashedApiKey = yield* hashToken(rawApiKey);

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
          }).onConflictDoNothing(),
      );

      yield* writeLog(db, {
        eventType: "bootstrap.user.created",
        level: "success",
        message: `Bootstrap user '${config.bootstrapUsername}' created`,
      });

      if (
        typeof Deno !== "undefined" && Deno.stderr &&
        (Deno.stderr as { isTerminal?: () => boolean }).isTerminal?.()
      ) {
        yield* Effect.logInfo(
          `\n*************************************************************\n* INITIAL SETUP\n* Bootstrap user created.\n* Username: ${config.bootstrapUsername}\n* Password: ${bootstrapPassword}\n* Please log in and change your password.\n*************************************************************\n`,
        );
      } else {
        yield* Effect.logInfo(
          "\n* INITIAL SETUP: Bootstrap user created. Log in with the configured credentials and change your password.\n",
        );
      }
    },
  );

  const login = Effect.fn("AuthService.login")(function* (
    request: LoginRequest,
  ) {
    const row = yield* findUserByUsername(db, request.username);

    if (!row) {
      return yield* AuthError.make({
        message: "Invalid username or password",
        status: 401,
      });
    }

    const verified = yield* verifyPassword(request.password, row.passwordHash)
      .pipe(
        Effect.mapError((error) =>
          toDatabaseError(`Failed to verify password: ${error.message}`)(error)
        ),
      );

    if (!verified) {
      return yield* AuthError.make({
        message: "Invalid username or password",
        status: 401,
      });
    }

    const userRow = row!;
    const token = yield* createSession(
      db,
      config.sessionDurationDays,
      userRow.id,
    );

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

    const userRow = row!;
    const token = yield* createSession(
      db,
      config.sessionDurationDays,
      userRow.id,
    );

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

      const result = yield* tryDatabasePromise(
        "Failed to resolve the current user",
        () =>
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

  const logout = Effect.fn("AuthService.logout")(function* (
    sessionToken: string | undefined,
  ) {
    if (!sessionToken) {
      return;
    }

    const hashedSessionToken = yield* hashToken(sessionToken);

    yield* tryDatabasePromise(
      "Failed to clear the active session",
      () => db.delete(sessions).where(eq(sessions.token, hashedSessionToken)),
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

    const userRow = row!;
    const verified = yield* verifyPassword(
      request.current_password,
      userRow.passwordHash,
    )
      .pipe(
        Effect.mapError((error) =>
          toDatabaseError(`Failed to verify password: ${error.message}`)(error)
        ),
      );

    if (!verified) {
      return yield* AuthError.make({
        message: "Current password is incorrect",
        status: 401,
      });
    }

    if (
      !request.new_password ||
      request.new_password.length < 8
    ) {
      return yield* AuthError.make({
        message: "New password must be at least 8 characters",
        status: 400,
      });
    }

    const passwordHash = yield* hashPassword(request.new_password).pipe(
      Effect.mapError((error) =>
        toDatabaseError(`Failed to hash password: ${error.message}`)(
          error.cause,
        )
      ),
    );

    yield* tryDatabasePromise(
      "Failed to update password",
      () =>
        db.transaction(async (tx) => {
          await tx
            .update(users)
            .set({
              mustChangePassword: false,
              passwordHash,
              updatedAt: nowIso(),
            })
            .where(eq(users.id, userId));
          await tx.delete(sessions).where(eq(sessions.userId, userId));
          await tx.update(appConfig).set({ bootstrapPassword: null }).where(
            eq(appConfig.id, 1),
          );
          await tx.insert(systemLogs).values({
            createdAt: nowIso(),
            details: null,
            eventType: "auth.password.changed",
            level: "success",
            message: `${userRow.username} changed their password`,
          });
        }),
    );
  });

  const getApiKey = Effect.fn("AuthService.getApiKey")(function* (
    userId: number,
  ) {
    const row = yield* findUserById(db, userId);

    if (!row) {
      return yield* AuthError.make({ message: "User not found", status: 404 });
    }

    return { api_key: "************************" };
  });

  const regenerateApiKey = Effect.fn("AuthService.regenerateApiKey")(
    function* (userId: number) {
      const row = yield* findUserById(db, userId);

      if (!row) {
        return yield* AuthError.make({
          message: "User not found",
          status: 404,
        });
      }

      const userRow = row!;
      const apiKey = randomHex(24);
      const hashedApiKey = yield* hashToken(apiKey);

      yield* tryDatabasePromise(
        "Failed to regenerate API key",
        () =>
          db.transaction(async (tx) => {
            await tx
              .update(users)
              .set({
                apiKey: hashedApiKey,
                updatedAt: nowIso(),
              })
              .where(eq(users.id, userId));
            await tx.delete(sessions).where(eq(sessions.userId, userId));
            await tx.insert(systemLogs).values({
              createdAt: nowIso(),
              details: null,
              eventType: "auth.api_key.regenerated",
              level: "success",
              message: `${userRow.username} regenerated an API key`,
            });
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
    must_change_password: row.mustChangePassword,
    updated_at: row.updatedAt,
    username: row.username,
  };
}

const hashToken = Effect.fn("Auth.hashToken")(function* (token: string) {
  const data = new TextEncoder().encode(token);
  const hashBuffer = yield* Effect.tryPromise({
    try: () => crypto.subtle.digest("SHA-256", data),
    catch: toDatabaseError("Failed to hash token"),
  });
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
});

const findUserByUsername = Effect.fn("Auth.findUserByUsername")(
  function* (db: AppDatabase, username: string) {
    const rows = yield* tryDatabasePromise(
      "Failed to find user by username",
      () =>
        db.select().from(users).where(eq(users.username, username)).limit(1),
    );
    return rows[0] ?? null;
  },
);

const findUserByApiKey = Effect.fn("Auth.findUserByApiKey")(
  function* (db: AppDatabase, apiKey: string) {
    const rows = yield* tryDatabasePromise(
      "Failed to find user by API key",
      () => db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1),
    );
    return rows[0] ?? null;
  },
);

const findUserById = Effect.fn("Auth.findUserById")(
  function* (db: AppDatabase, userId: number) {
    const rows = yield* tryDatabasePromise(
      "Failed to find user by ID",
      () => db.select().from(users).where(eq(users.id, userId)).limit(1),
    );
    return rows[0] ?? null;
  },
);

const createSession = Effect.fn("Auth.createSession")(
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

const writeLog = Effect.fn("Auth.writeLog")(
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
