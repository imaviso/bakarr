import { Clock, DateTime, Duration, Effect, Option, Ref } from "effect";

import {
  brandUserId,
  type ApiKeyLoginRequest,
  type AuthUser,
  type LoginRequest,
  type LoginResponse,
} from "@packages/shared/index.ts";
import { AppConfig } from "@/app/config/schema.ts";
import { DatabaseError } from "@/db/database.ts";
import type { users } from "@/db/schema.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { randomHexFrom, RandomService } from "@/infra/random.ts";
import {
  hashPassword,
  isPasswordHashOutdated,
  PasswordCrypto,
  verifyPassword,
} from "@/security/password.ts";
import { TokenHasher, type TokenHasherError } from "@/security/token-hasher.ts";
import {
  type AuthCryptoError,
  type AuthError,
  AuthUnauthorizedError,
} from "@/features/auth/errors.ts";
import {
  makeLoginRateLimiter,
  type LoginRateLimiterShape,
} from "@/features/auth/login-rate-limiter.ts";
import { AuthUserRepository } from "@/features/auth/user-repository.ts";

export interface SessionIdentity {
  readonly token: string;
  readonly user: AuthUser;
}

export interface AuthSessionServiceShape {
  readonly login: (
    request: LoginRequest,
    clientKey: string,
  ) => Effect.Effect<
    SessionIdentity & { response: LoginResponse },
    AuthError | DatabaseError | AuthCryptoError
  >;
  readonly loginWithApiKey: (
    request: ApiKeyLoginRequest,
    clientKey: string,
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

const SESSION_REFRESH_INTERVAL = Duration.minutes(5);
const SESSION_PRUNE_INTERVAL = Duration.minutes(5);

type LoginAttemptError = DatabaseError | AuthCryptoError | AuthUnauthorizedError;

const makeAuthSessionService = Effect.fn("AuthSessionService.make")(function* () {
  const usersRepository = yield* AuthUserRepository;
  const config = yield* AppConfig;
  const passwordCrypto = yield* PasswordCrypto;
  const random = yield* RandomService;
  const tokenHasher = yield* TokenHasher;
  const loginRateLimiter: LoginRateLimiterShape = yield* makeLoginRateLimiter();
  const lastPruneAtMsRef = yield* Ref.make(0);
  const nowIso = currentNowIso;
  const randomHex = (bytes: number) => randomHexFrom(random, bytes);
  const hashToken = tokenHasher.hashToken;

  const expiresAtIso = Effect.fn("AuthSessionService.expiresAtIso")(function* () {
    const now = yield* DateTime.now;
    return DateTime.formatIso(DateTime.add(now, { days: config.sessionDurationDays }));
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

  /**
   * Opportunistic cleanup: expired session rows are deleted at most once per
   * SESSION_PRUNE_INTERVAL while auth requests flow through resolveViewer.
   * Failures are swallowed — pruning must never break authentication.
   */
  const maybePruneExpiredSessions = Effect.fn("AuthSessionService.maybePruneExpiredSessions")(
    function* (nowIsoValue: string) {
      const nowMs = yield* Clock.currentTimeMillis;
      const shouldPrune = yield* Ref.modify(
        lastPruneAtMsRef,
        (lastPrunedAtMs): readonly [boolean, number] =>
          nowMs - lastPrunedAtMs >= Duration.toMillis(SESSION_PRUNE_INTERVAL)
            ? [true, nowMs]
            : [false, lastPrunedAtMs],
      );

      if (!shouldPrune) {
        return;
      }

      yield* usersRepository
        .pruneExpiredSessions(nowIsoValue)
        .pipe(
          Effect.catchAll((cause) =>
            Effect.logWarning("Failed to prune expired sessions; will retry next interval").pipe(
              Effect.annotateLogs({ cause: String(cause) }),
              Effect.zipRight(Effect.void),
            ),
          ),
        );
    },
  );

  const guardLogin = <A>(clientKey: string, attempt: Effect.Effect<A, LoginAttemptError>) =>
    loginRateLimiter.rejectWhileLocked(clientKey).pipe(
      Effect.zipRight(
        attempt.pipe(
          Effect.tapErrorTag("AuthUnauthorizedError", () =>
            loginRateLimiter.recordFailure(clientKey),
          ),
          Effect.tap(() => loginRateLimiter.reset(clientKey)),
        ),
      ),
    );

  const authenticateWithPassword = Effect.fn("AuthSessionService.authenticateWithPassword")(
    function* (request: LoginRequest) {
      const rowOption = yield* usersRepository.findUserByUsername(request.username);

      if (Option.isNone(rowOption)) {
        return yield* AuthUnauthorizedError.make({
          message: "Invalid username or password",
        });
      }

      const row = rowOption.value;

      const verified = yield* verifyPassword(passwordCrypto, request.password, row.passwordHash);

      if (!verified) {
        return yield* AuthUnauthorizedError.make({
          message: "Invalid username or password",
        });
      }

      if (isPasswordHashOutdated(row.passwordHash)) {
        const newHash = yield* hashPassword(passwordCrypto, request.password).pipe(
          Effect.catchAll((cause) =>
            Effect.logWarning("Failed to rehash outdated password hash").pipe(
              Effect.annotateLogs({ cause: String(cause), userId: row.id }),
              Effect.zipRight(Effect.succeed(undefined)),
            ),
          ),
        );
        if (newHash !== undefined) {
          const now = yield* nowIso();
          yield* usersRepository
            .updatePasswordHash({ passwordHash: newHash, updatedAt: now, userId: row.id })
            .pipe(
              Effect.catchAll((cause) =>
                Effect.logWarning("Failed to persist rehashed password").pipe(
                  Effect.annotateLogs({ cause: String(cause), userId: row.id }),
                ),
              ),
            );
        }
      }

      return row;
    },
  );

  const login = Effect.fn("AuthSessionService.login")(function* (
    request: LoginRequest,
    clientKey: string,
  ) {
    const row = yield* guardLogin(clientKey, authenticateWithPassword(request));
    const token = yield* createSession(row.id);

    yield* usersRepository.writeLog({
      createdAt: yield* nowIso(),
      eventType: "auth.login",
      level: "success",
      message: `${row.username} signed in`,
    });

    return toLoginResult(row, token);
  });

  const authenticateWithApiKey = Effect.fn("AuthSessionService.authenticateWithApiKey")(function* (
    request: ApiKeyLoginRequest,
  ) {
    const hashedApiKey = yield* hashToken(request.api_key);

    const rowOption = yield* usersRepository.findUserByApiKey(hashedApiKey);

    if (Option.isNone(rowOption)) {
      return yield* AuthUnauthorizedError.make({ message: "Invalid API key" });
    }

    return rowOption.value;
  });

  const loginWithApiKey = Effect.fn("AuthSessionService.loginWithApiKey")(function* (
    request: ApiKeyLoginRequest,
    clientKey: string,
  ) {
    const row = yield* guardLogin(clientKey, authenticateWithApiKey(request));
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

      yield* maybePruneExpiredSessions(sessionNow);

      const result = yield* usersRepository.resolveUserBySessionToken(
        hashedSessionToken,
        sessionNow,
      );

      if (Option.isSome(result)) {
        const row = result.value;
        const now = yield* DateTime.now;
        const lastSeenAt = DateTime.unsafeFromDate(new Date(row.lastSeenAt));
        const needsRefresh = Duration.greaterThanOrEqualTo(
          DateTime.distanceDuration(now, lastSeenAt),
          SESSION_REFRESH_INTERVAL,
        );

        if (needsRefresh) {
          const expiresAt = yield* expiresAtIso();
          yield* usersRepository.refreshSession({
            expiresAt,
            lastSeenAt: sessionNow,
            tokenHash: hashedSessionToken,
          });
        }

        return Option.some(toAuthUser(row));
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

export class AuthSessionService extends Effect.Service<AuthSessionService>()(
  "@bakarr/api/AuthSessionService",
  {
    dependencies: [
      AuthUserRepository.Default,
      PasswordCrypto.Default,
      RandomService.Default,
      TokenHasher.Default,
    ],
    effect: makeAuthSessionService(),
  },
) {}

export const AuthSessionServiceLive = AuthSessionService.Default;

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

function toAuthUser(
  row: Pick<
    typeof users.$inferSelect,
    "createdAt" | "id" | "mustChangePassword" | "updatedAt" | "username"
  >,
): AuthUser {
  return {
    created_at: row.createdAt,
    id: brandUserId(row.id),
    must_change_password: row.mustChangePassword,
    updated_at: row.updatedAt,
    username: row.username,
  };
}
