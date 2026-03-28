import { Context, Effect, Layer } from "effect";

import type {
  ApiKeyResponse,
  ChangePasswordRequest,
} from "../../../../../packages/shared/src/index.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { nowIsoFromClock, ClockService } from "../../lib/clock.ts";
import { randomHexFrom, RandomService } from "../../lib/random.ts";
import { hashPasswordWith, verifyPassword } from "../../security/password.ts";
import { TokenHasher, type TokenHasherError } from "../../security/token-hasher.ts";
import { AuthError, type AuthCryptoError } from "./errors.ts";
import {
  changePasswordState,
  findUserById,
  regenerateApiKeyState,
} from "./service-support.ts";

export interface AuthCredentialServiceShape {
  readonly changePassword: (
    userId: number,
    request: ChangePasswordRequest,
  ) => Effect.Effect<void, AuthError | DatabaseError | AuthCryptoError>;
  readonly getApiKey: (userId: number) => Effect.Effect<ApiKeyResponse, AuthError | DatabaseError>;
  readonly regenerateApiKey: (
    userId: number,
  ) => Effect.Effect<ApiKeyResponse, AuthError | DatabaseError | TokenHasherError>;
}

export class AuthCredentialService extends Context.Tag("@bakarr/api/AuthCredentialService")<
  AuthCredentialService,
  AuthCredentialServiceShape
>() {}

const makeAuthCredentialService = Effect.gen(function* () {
  const { db } = yield* Database;
  const clock = yield* ClockService;
  const random = yield* RandomService;
  const tokenHasher = yield* TokenHasher;
  const nowIso = () => nowIsoFromClock(clock);
  const randomHex = (bytes: number) => randomHexFrom(random, bytes);
  const hashPassword = hashPasswordWith(random.randomBytes);
  const hashToken = tokenHasher.hashToken;

  const changePassword = Effect.fn("AuthCredentialService.changePassword")(function* (
    userId: number,
    request: ChangePasswordRequest,
  ) {
    const row = yield* findUserById(db, userId);

    if (!row) {
      return yield* AuthError.make({ message: "User not found", status: 404 });
    }

    const verified = yield* verifyPassword(request.current_password, row.passwordHash);

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

    const passwordHash = yield* hashPassword(request.new_password);

    const changeNow = yield* nowIso();
    yield* changePasswordState({
      changedAt: changeNow,
      db,
      passwordHash,
      userId,
      username: row.username,
    });
  });

  const getApiKey = Effect.fn("AuthCredentialService.getApiKey")(function* (userId: number) {
    const row = yield* findUserById(db, userId);

    if (!row) {
      return yield* AuthError.make({ message: "User not found", status: 404 });
    }

    return { api_key: "************************" };
  });

  const regenerateApiKey = Effect.fn("AuthCredentialService.regenerateApiKey")(function* (
    userId: number,
  ) {
    const row = yield* findUserById(db, userId);

    if (!row) {
      return yield* AuthError.make({ message: "User not found", status: 404 });
    }

    const apiKey = yield* randomHex(24);
    const hashedApiKey = yield* hashToken(apiKey);
    const regenNow = yield* nowIso();

    yield* regenerateApiKeyState({
      apiKeyHash: hashedApiKey,
      db,
      regeneratedAt: regenNow,
      userId,
      username: row.username,
    });

    return { api_key: apiKey };
  });

  return {
    changePassword,
    getApiKey,
    regenerateApiKey,
  } satisfies AuthCredentialServiceShape;
});

export const AuthCredentialServiceLive = Layer.effect(
  AuthCredentialService,
  makeAuthCredentialService,
);
