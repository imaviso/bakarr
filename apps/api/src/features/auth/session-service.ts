import { and, eq, gt } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type {
  ApiKeyLoginRequest,
  AuthUser,
  LoginRequest,
  LoginResponse,
} from "@packages/shared/index.ts";
import { AppConfig } from "@/config.ts";
import type { AppDatabase } from "@/db/database.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { sessions, users } from "@/db/schema.ts";
import { nowIsoFromClock, ClockService } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { randomHexFrom, RandomService } from "@/lib/random.ts";
import { verifyPassword } from "@/security/password.ts";
import { TokenHasher, type TokenHasherError } from "@/security/token-hasher.ts";
import { AuthError, type AuthCryptoError } from "@/features/auth/errors.ts";
import { writeAuthLog } from "@/features/auth/audit-log.ts";
import { findUserByApiKey, findUserByUsername } from "@/features/auth/user-repository.ts";

export interface SessionIdentity {
  readonly token: string;
  readonly user: AuthUser;
}

export interface AuthSessionServiceShape {
  readonly login: (
    request: LoginRequest,
  ) => Effect.Effect<
    SessionIdentity & { response: LoginResponse },
    AuthError | DatabaseError | AuthCryptoError
  >;
  readonly loginWithApiKey: (
    request: ApiKeyLoginRequest,
  ) => Effect.Effect<
    SessionIdentity & { response: LoginResponse },
    AuthError | DatabaseError | AuthCryptoError
  >;
  readonly resolveViewer: (
    sessionToken: string | undefined,
    apiKey: string | undefined,
  ) => Effect.Effect<AuthUser | null, DatabaseError | AuthCryptoError>;
  readonly logout: (
    sessionToken: string | undefined,
  ) => Effect.Effect<void, DatabaseError | TokenHasherError>;
}

export class AuthSessionService extends Context.Tag("@bakarr/api/AuthSessionService")<
  AuthSessionService,
  AuthSessionServiceShape
>() {}

const DAY_MS = 24 * 60 * 60 * 1000;

const expiresAtIso = Effect.fn("AuthSessionService.expiresAtIso")(function* (
  durationDays: number,
  currentTimeMillis: () => Effect.Effect<number>,
) {
  const now = yield* currentTimeMillis();
  return new Date(now + durationDays * DAY_MS).toISOString();
});

const createSession = Effect.fn("AuthSessionService.createSession")(function* (
  db: AppDatabase,
  durationDays: number,
  hashToken: (token: string) => Effect.Effect<string, TokenHasherError>,
  userId: number,
  randomHex: (bytes: number) => Effect.Effect<string>,
  nowIso: () => Effect.Effect<string>,
  currentTimeMillis: () => Effect.Effect<number>,
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

const makeAuthSessionService = Effect.gen(function* () {
  const { db } = yield* Database;
  const config = yield* AppConfig;
  const clock = yield* ClockService;
  const random = yield* RandomService;
  const tokenHasher = yield* TokenHasher;
  const nowIso = () => nowIsoFromClock(clock);
  const currentTimeMillis = () => clock.currentTimeMillis;
  const randomHex = (bytes: number) => randomHexFrom(random, bytes);
  const hashToken = tokenHasher.hashToken;

  const login = Effect.fn("AuthSessionService.login")(function* (request: LoginRequest) {
    const row = yield* findUserByUsername(db, request.username);

    if (!row) {
      return yield* AuthError.make({
        message: "Invalid username or password",
        status: 401,
      });
    }

    const verified = yield* verifyPassword(request.password, row.passwordHash);

    if (!verified) {
      return yield* AuthError.make({
        message: "Invalid username or password",
        status: 401,
      });
    }

    const token = yield* createSession(
      db,
      config.sessionDurationDays,
      hashToken,
      row.id,
      randomHex,
      nowIso,
      currentTimeMillis,
    );

    yield* writeAuthLog(
      db,
      {
        eventType: "auth.login",
        level: "success",
        message: `${row.username} signed in`,
      },
      nowIso,
    );

    return toLoginResult(row, token);
  });

  const loginWithApiKey = Effect.fn("AuthSessionService.loginWithApiKey")(function* (
    request: ApiKeyLoginRequest,
  ) {
    const hashedApiKey = yield* hashToken(request.api_key);

    const row = yield* findUserByApiKey(db, hashedApiKey);

    if (!row) {
      return yield* AuthError.make({ message: "Invalid API key", status: 401 });
    }

    const token = yield* createSession(
      db,
      config.sessionDurationDays,
      hashToken,
      row.id,
      randomHex,
      nowIso,
      currentTimeMillis,
    );

    yield* writeAuthLog(
      db,
      {
        eventType: "auth.login.api_key",
        level: "success",
        message: `${row.username} signed in with an API key`,
      },
      nowIso,
    );

    return toLoginResult(row, token);
  });

  const resolveViewer = Effect.fn("AuthSessionService.resolveViewer")(function* (
    sessionToken: string | undefined,
    apiKey: string | undefined,
  ) {
    if (sessionToken) {
      const hashedSessionToken = yield* hashToken(sessionToken);
      const sessionNow = yield* nowIso();

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
        const expiresAt = yield* expiresAtIso(config.sessionDurationDays, currentTimeMillis);
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

  const logout = Effect.fn("AuthSessionService.logout")(function* (
    sessionToken: string | undefined,
  ) {
    if (!sessionToken) {
      return;
    }

    const hashedSessionToken = yield* hashToken(sessionToken);

    yield* tryDatabasePromise("Failed to clear the active session", () =>
      db.delete(sessions).where(eq(sessions.token, hashedSessionToken)),
    );
  });

  return {
    login,
    loginWithApiKey,
    logout,
    resolveViewer,
  } satisfies AuthSessionServiceShape;
});

export const AuthSessionServiceLive = Layer.effect(AuthSessionService, makeAuthSessionService);

function toLoginResult(userRow: typeof users.$inferSelect, token: string) {
  return {
    response: {
      api_key: "************************",
      must_change_password: userRow.mustChangePassword,
      username: userRow.username,
    },
    token,
    user: toAuthUser(userRow),
  };
}

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    created_at: row.createdAt,
    id: row.id,
    must_change_password: row.mustChangePassword,
    updated_at: row.updatedAt,
    username: row.username,
  };
}
