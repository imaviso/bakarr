import { Context, Effect, Layer, Option } from "effect";

import type {
  ApiKeyLoginRequest,
  AuthUser,
  LoginRequest,
  LoginResponse,
} from "@packages/shared/index.ts";
import { AppConfig } from "@/config/schema.ts";
import { DatabaseError } from "@/db/database.ts";
import type { users } from "@/db/schema.ts";
import { nowIsoFromClock, ClockService } from "@/infra/clock.ts";
import { randomHexFrom, RandomService } from "@/infra/random.ts";
import { PasswordCrypto, verifyPassword } from "@/security/password.ts";
import { TokenHasher, type TokenHasherError } from "@/security/token-hasher.ts";
import { AuthError, type AuthCryptoError } from "@/features/auth/errors.ts";
import { AuthUserRepository } from "@/features/auth/user-repository.ts";

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
  ) => Effect.Effect<Option.Option<AuthUser>, DatabaseError | AuthCryptoError>;
  readonly logout: (
    sessionToken: string | undefined,
  ) => Effect.Effect<void, DatabaseError | TokenHasherError>;
}

export class AuthSessionService extends Context.Tag("@bakarr/api/AuthSessionService")<
  AuthSessionService,
  AuthSessionServiceShape
>() {}

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const makeAuthSessionService = Effect.gen(function* () {
  const usersRepository = yield* AuthUserRepository;
  const config = yield* AppConfig;
  const clock = yield* ClockService;
  const passwordCrypto = yield* PasswordCrypto;
  const random = yield* RandomService;
  const tokenHasher = yield* TokenHasher;
  const nowIso = () => nowIsoFromClock(clock);
  const currentTimeMillis = () => clock.currentTimeMillis;
  const randomHex = (bytes: number) => randomHexFrom(random, bytes);
  const hashToken = tokenHasher.hashToken;

  const expiresAtIso = Effect.fn("AuthSessionService.expiresAtIso")(function* () {
    const now = yield* currentTimeMillis();
    return nowPlusDurationIso(now, config.sessionDurationDays * DAY_MS);
  });

  const createSession = Effect.fn("AuthSessionService.createSession")(function* (userId: number) {
    const token = yield* randomHex(32);
    const tokenHash = yield* hashToken(token);
    const now = yield* nowIso();
    const expiresAt = yield* expiresAtIso();

    yield* usersRepository.createSession({
      createdAt: now,
      expiresAt,
      tokenHash,
      userId,
    });

    return token;
  });

  const login = Effect.fn("AuthSessionService.login")(function* (request: LoginRequest) {
    const rowOption = yield* usersRepository.findUserByUsername(request.username);

    if (Option.isNone(rowOption)) {
      return yield* AuthError.make({
        kind: "Unauthorized",
        message: "Invalid username or password",
      });
    }

    const row = rowOption.value;

    const verified = yield* verifyPassword(request.password, row.passwordHash).pipe(
      Effect.provideService(PasswordCrypto, passwordCrypto),
    );

    if (!verified) {
      return yield* AuthError.make({
        kind: "Unauthorized",
        message: "Invalid username or password",
      });
    }

    const token = yield* createSession(row.id);

    yield* usersRepository.writeLog({
      createdAt: yield* nowIso(),
      eventType: "auth.login",
      level: "success",
      message: `${row.username} signed in`,
    });

    return toLoginResult(row, token);
  });

  const loginWithApiKey = Effect.fn("AuthSessionService.loginWithApiKey")(function* (
    request: ApiKeyLoginRequest,
  ) {
    const hashedApiKey = yield* hashToken(request.api_key);

    const rowOption = yield* usersRepository.findUserByApiKey(hashedApiKey);

    if (Option.isNone(rowOption)) {
      return yield* AuthError.make({ kind: "Unauthorized", message: "Invalid API key" });
    }

    const row = rowOption.value;

    const token = yield* createSession(row.id);

    yield* usersRepository.writeLog({
      createdAt: yield* nowIso(),
      eventType: "auth.login.api_key",
      level: "success",
      message: `${row.username} signed in with an API key`,
    });

    return toLoginResult(row, token);
  });

  const resolveViewer = Effect.fn("AuthSessionService.resolveViewer")(function* (
    sessionToken: string | undefined,
    apiKey: string | undefined,
  ) {
    if (sessionToken) {
      const hashedSessionToken = yield* hashToken(sessionToken);
      const sessionNow = yield* nowIso();

      const result = yield* usersRepository.resolveUserBySessionToken(
        hashedSessionToken,
        sessionNow,
      );

      if (Option.isSome(result)) {
        const row = result.value;
        const nowMillis = yield* currentTimeMillis();
        const lastSeenAtMillis = isoToMillis(row.lastSeenAt);
        const needsRefresh =
          Number.isFinite(nowMillis) &&
          Number.isFinite(lastSeenAtMillis) &&
          nowMillis - lastSeenAtMillis >= SESSION_REFRESH_INTERVAL_MS;

        if (needsRefresh) {
          const expiresAt = yield* expiresAtIso();
          yield* usersRepository.refreshSession({
            expiresAt,
            lastSeenAt: sessionNow,
            tokenHash: hashedSessionToken,
          });
        }

        return Option.some({
          created_at: row.createdAt,
          id: row.id,
          must_change_password: row.mustChangePassword,
          updated_at: row.updatedAt,
          username: row.username,
        });
      }
    }

    if (!apiKey) {
      return Option.none();
    }

    const hashedApiKey = yield* hashToken(apiKey);
    const rowOption = yield* usersRepository.findUserByApiKey(hashedApiKey);

    return Option.map(rowOption, toAuthUser);
  });

  const logout = Effect.fn("AuthSessionService.logout")(function* (
    sessionToken: string | undefined,
  ) {
    if (!sessionToken) {
      return;
    }

    const hashedSessionToken = yield* hashToken(sessionToken);

    yield* usersRepository.deleteSession(hashedSessionToken);
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
      api_key_masked: true,
      must_change_password: userRow.mustChangePassword,
      username: userRow.username,
    },
    token,
    user: toAuthUser(userRow),
  };
}

function nowPlusDurationIso(nowMillis: number, durationMillis: number): string {
  return new Date(nowMillis + durationMillis).toISOString();
}

function isoToMillis(value: string): number {
  return Date.parse(value);
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
