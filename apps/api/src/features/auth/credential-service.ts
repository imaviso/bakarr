import { Context, Effect, Layer, Option } from "effect";

import type { ApiKeyResponse, ChangePasswordRequest } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import { nowIsoFromClock, ClockService } from "@/infra/clock.ts";
import { randomHexFrom, RandomService } from "@/infra/random.ts";
import { hashPassword, PasswordCrypto, verifyPassword } from "@/security/password.ts";
import { TokenHasher, type TokenHasherError } from "@/security/token-hasher.ts";
import {
  AuthBadRequestError,
  type AuthCryptoError,
  type AuthError,
  AuthNotFoundError,
  AuthUnauthorizedError,
} from "@/features/auth/errors.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { AuthUserRepository } from "@/features/auth/user-repository.ts";

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
  const users = yield* AuthUserRepository;
  const clock = yield* ClockService;
  const passwordCrypto = yield* PasswordCrypto;
  const random = yield* RandomService;
  const tokenHasher = yield* TokenHasher;
  const eventBus = yield* EventBus;
  const nowIso = () => nowIsoFromClock(clock);
  const randomHex = (bytes: number) => randomHexFrom(random, bytes);
  const hashToken = tokenHasher.hashToken;

  const changePassword = Effect.fn("AuthCredentialService.changePassword")(function* (
    userId: number,
    request: ChangePasswordRequest,
  ) {
    const rowOption = yield* users.findUserById(userId);

    if (Option.isNone(rowOption)) {
      return yield* AuthNotFoundError.make({ message: "User not found" });
    }

    const row = rowOption.value;

    const verified = yield* verifyPassword(
      passwordCrypto,
      request.current_password,
      row.passwordHash,
    );

    if (!verified) {
      return yield* AuthUnauthorizedError.make({
        message: "Current password is incorrect",
      });
    }

    if (!request.new_password || request.new_password.length < 8) {
      return yield* AuthBadRequestError.make({
        message: "New password must be at least 8 characters",
      });
    }

    const passwordHash = yield* hashPassword(passwordCrypto, request.new_password);
    const apiKey = yield* randomHex(24);
    const apiKeyHash = yield* hashToken(apiKey);

    const changeNow = yield* nowIso();
    yield* users.changePasswordState({
      apiKeyHash,
      changedAt: changeNow,
      passwordHash,
      userId,
      username: row.username,
    });

    yield* eventBus.publish({ type: "PasswordChanged" });
    return undefined;
  });

  const getApiKey = Effect.fn("AuthCredentialService.getApiKey")(function* (userId: number) {
    const rowOption = yield* users.findUserById(userId);

    if (Option.isNone(rowOption)) {
      return yield* AuthNotFoundError.make({ message: "User not found" });
    }

    return { api_key: "************************", api_key_masked: true };
  });

  const regenerateApiKey = Effect.fn("AuthCredentialService.regenerateApiKey")(function* (
    userId: number,
  ) {
    const rowOption = yield* users.findUserById(userId);

    if (Option.isNone(rowOption)) {
      return yield* AuthNotFoundError.make({ message: "User not found" });
    }

    const row = rowOption.value;

    const apiKey = yield* randomHex(24);
    const hashedApiKey = yield* hashToken(apiKey);
    const regenNow = yield* nowIso();

    yield* users.regenerateApiKeyState({
      apiKeyHash: hashedApiKey,
      regeneratedAt: regenNow,
      userId,
      username: row.username,
    });

    yield* eventBus.publish({ type: "ApiKeyRegenerated" });

    return { api_key: apiKey, api_key_masked: false };
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
