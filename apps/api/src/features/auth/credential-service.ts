import { Context, Effect, Layer, Option } from "effect";

import type { ApiKeyResponse, ChangePasswordRequest } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import { nowIsoFromClock, ClockService } from "@/infra/clock.ts";
import { randomHexFrom, RandomService } from "@/infra/random.ts";
import { hashPasswordWith, verifyPassword } from "@/security/password.ts";
import { TokenHasher, type TokenHasherError } from "@/security/token-hasher.ts";
import { AuthError, type AuthCryptoError } from "@/features/auth/errors.ts";
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
  const random = yield* RandomService;
  const tokenHasher = yield* TokenHasher;
  const eventBus = yield* EventBus;
  const nowIso = () => nowIsoFromClock(clock);
  const randomHex = (bytes: number) => randomHexFrom(random, bytes);
  const hashPassword = hashPasswordWith(random.randomBytes);
  const hashToken = tokenHasher.hashToken;

  const changePassword = Effect.fn("AuthCredentialService.changePassword")(function* (
    userId: number,
    request: ChangePasswordRequest,
  ) {
    const rowOption = yield* users.findUserById(userId);

    if (Option.isNone(rowOption)) {
      return yield* AuthError.make({ message: "User not found", status: 404 });
    }

    const row = rowOption.value;

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
      return yield* AuthError.make({ message: "User not found", status: 404 });
    }

    return { api_key: "************************" };
  });

  const regenerateApiKey = Effect.fn("AuthCredentialService.regenerateApiKey")(function* (
    userId: number,
  ) {
    const rowOption = yield* users.findUserById(userId);

    if (Option.isNone(rowOption)) {
      return yield* AuthError.make({ message: "User not found", status: 404 });
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
