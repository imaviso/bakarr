import { Context, Effect, Layer, Option } from "effect";

import { BootstrapConfig } from "@/config/schema.ts";
import { DatabaseError } from "@/db/database.ts";
import { nowIsoFromClock, ClockService } from "@/infra/clock.ts";
import { randomHexFrom, RandomService } from "@/infra/random.ts";
import { hashPassword, PasswordCrypto } from "@/security/password.ts";
import { TokenHasher } from "@/security/token-hasher.ts";
import { announceBootstrapCredentials } from "@/features/auth/bootstrap-output.ts";
import type { AuthCryptoError } from "@/features/auth/errors.ts";
import { AuthUserRepository } from "@/features/auth/user-repository.ts";

export interface AuthBootstrapServiceShape {
  readonly ensureBootstrapUser: () => Effect.Effect<void, DatabaseError | AuthCryptoError>;
}

export class AuthBootstrapService extends Context.Tag("@bakarr/api/AuthBootstrapService")<
  AuthBootstrapService,
  AuthBootstrapServiceShape
>() {}

const makeAuthBootstrapService = Effect.gen(function* () {
  const users = yield* AuthUserRepository;
  const config = yield* BootstrapConfig;
  const clock = yield* ClockService;
  const passwordCrypto = yield* PasswordCrypto;
  const random = yield* RandomService;
  const tokenHasher = yield* TokenHasher;
  const nowIso = () => nowIsoFromClock(clock);
  const randomHex = (bytes: number) => randomHexFrom(random, bytes);
  const hashToken = tokenHasher.hashToken;

  /**
   * Bootstrap user lifecycle (one-way transition):
   *
   * 1. On first run (no users in DB), creates an admin user with:
   *    - username/password from env config (BOOTSTRAP_USERNAME/PASSWORD)
   *    - `mustChangePassword: true` — UI forces a password change on first login
   *    - a generated API key
   *    - credentials printed to stdout so the operator can log in
   *
   * 2. When the user changes their password via the credential service:
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
  const ensureBootstrapUser = Effect.fn("AuthBootstrapService.ensureBootstrapUser")(function* () {
    const existingUserId = yield* users.findAnyUserId();

    if (Option.isSome(existingUserId)) {
      return;
    }

    const bootstrapPassword = config.bootstrapPassword;

    const now = yield* nowIso();
    const passwordHash = yield* hashPassword(bootstrapPassword).pipe(
      Effect.provideService(PasswordCrypto, passwordCrypto),
    );

    const rawApiKey = yield* randomHex(24);
    const hashedApiKey = yield* hashToken(rawApiKey);

    yield* users.createBootstrapUser({
      apiKeyHash: hashedApiKey,
      createdAt: now,
      passwordHash,
      username: config.bootstrapUsername,
    });

    yield* users.writeLog({
      createdAt: yield* nowIso(),
      eventType: "bootstrap.user.created",
      level: "success",
      message: `Bootstrap user '${config.bootstrapUsername}' created`,
    });

    yield* announceBootstrapCredentials({
      username: config.bootstrapUsername,
      // Intentionally print only generated bootstrap passwords. The bootstrap
      // account is forced to rotate credentials on first login
      // (`mustChangePassword: true`), but operator-provided credentials from
      // env/config should never be echoed back to logs.
      ...(config.bootstrapPasswordIsEnvOverride ? {} : { password: bootstrapPassword }),
    });
  });

  return { ensureBootstrapUser } satisfies AuthBootstrapServiceShape;
});

export const AuthBootstrapServiceLive = Layer.effect(
  AuthBootstrapService,
  makeAuthBootstrapService,
);
