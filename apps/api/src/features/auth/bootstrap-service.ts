import { Context, Effect, Layer } from "effect";

import { AppConfig } from "@/config.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { users } from "@/db/schema.ts";
import { nowIsoFromClock, ClockService } from "@/lib/clock.ts";
import { randomHexFrom, RandomService } from "@/lib/random.ts";
import { hashPasswordWith } from "@/security/password.ts";
import { TokenHasher } from "@/security/token-hasher.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { announceBootstrapCredentials } from "@/features/auth/bootstrap-output.ts";
import { writeAuthLog } from "@/features/auth/audit-log.ts";
import type { AuthCryptoError } from "@/features/auth/errors.ts";

export interface AuthBootstrapServiceShape {
  readonly ensureBootstrapUser: () => Effect.Effect<void, DatabaseError | AuthCryptoError>;
}

export class AuthBootstrapService extends Context.Tag("@bakarr/api/AuthBootstrapService")<
  AuthBootstrapService,
  AuthBootstrapServiceShape
>() {}

const makeAuthBootstrapService = Effect.gen(function* () {
  const { db } = yield* Database;
  const config = yield* AppConfig;
  const clock = yield* ClockService;
  const random = yield* RandomService;
  const tokenHasher = yield* TokenHasher;
  const nowIso = () => nowIsoFromClock(clock);
  const randomHex = (bytes: number) => randomHexFrom(random, bytes);
  const hashPassword = hashPasswordWith(random.randomBytes);
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
    const existing = yield* tryDatabasePromise("Failed to ensure bootstrap user", () =>
      db.select({ id: users.id }).from(users).limit(1),
    );

    if (existing.length > 0) {
      return;
    }

    const bootstrapPassword = config.bootstrapPassword;

    const now = yield* nowIso();
    const passwordHash = yield* hashPassword(bootstrapPassword);

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

    yield* writeAuthLog(
      db,
      {
        eventType: "bootstrap.user.created",
        level: "success",
        message: `Bootstrap user '${config.bootstrapUsername}' created`,
      },
      nowIso,
    );

    yield* announceBootstrapCredentials({
      username: config.bootstrapUsername,
      ...(config.bootstrapPasswordIsEnvOverride ? {} : { password: bootstrapPassword }),
    });
  });

  return { ensureBootstrapUser } satisfies AuthBootstrapServiceShape;
});

export const AuthBootstrapServiceLive = Layer.effect(
  AuthBootstrapService,
  makeAuthBootstrapService,
);
