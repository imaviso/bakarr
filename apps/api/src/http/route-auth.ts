import { HttpServerRequest } from "@effect/platform";
import { Effect, Schema } from "effect";

import { type AuthUser, AuthUserSchema } from "../../../../packages/shared/src/index.ts";
import { AppConfig } from "../config.ts";
import { AuthError, AuthService } from "../features/auth/service.ts";

export function getApiKey(headerApiKey: string | undefined, authorization: string | undefined) {
  if (headerApiKey) {
    return headerApiKey;
  }

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return undefined;
}

export const requireViewerFromHttpRequest = Effect.fn("Http.requireViewerFromHttpRequest")(
  function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* AppConfig;
    const sessionToken = request.cookies[config.sessionCookieName];
    const apiKey = getApiKey(request.headers["x-api-key"], request.headers["authorization"]);
    const viewer = yield* Effect.flatMap(AuthService, (auth) =>
      auth.resolveViewer(sessionToken, apiKey),
    );

    if (!viewer) {
      return yield* new AuthError({ message: "Unauthorized", status: 401 });
    }

    return viewer;
  },
);

export function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    created_at?: unknown;
    id?: unknown;
    must_change_password?: unknown;
    updated_at?: unknown;
    username?: unknown;
  };

  if (
    typeof candidate.id !== "number" ||
    !Number.isFinite(candidate.id) ||
    typeof candidate.username !== "string" ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string" ||
    typeof candidate.must_change_password !== "boolean"
  ) {
    return false;
  }

  const result = Schema.decodeUnknownEither(AuthUserSchema)(value);
  return result._tag === "Right";
}
