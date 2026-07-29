import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { Duration, Effect, Option } from "effect";
import { LoginResponseSchema, type LoginResponse } from "@packages/shared/index.ts";

import { AppConfig } from "@/config/schema.ts";
import { AuthForbiddenError, AuthUnauthorizedError } from "@/features/auth/errors.ts";
import { AuthSessionService } from "@/features/auth/session-service.ts";
import { encodeSchemaJsonResponse } from "@/http/shared/router-helpers.ts";

function extractApiKeyFromHeaders(headers: Readonly<Record<string, string | undefined>>) {
  const headerApiKey = headers["x-api-key"];

  if (headerApiKey) {
    return headerApiKey;
  }

  const authorization = headers["authorization"];
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
}

export const requireViewerFromHttpRequest = Effect.fn("Http.requireViewerFromHttpRequest")(
  function* (options: { readonly allowPasswordChangeRequired?: boolean } = {}) {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* AppConfig;
    const sessionToken = request.cookies[config.sessionCookieName];
    const apiKey = extractApiKeyFromHeaders(request.headers);

    const auth = yield* AuthSessionService;
    const viewer = yield* auth.resolveViewer(sessionToken, apiKey);

    if (Option.isNone(viewer)) {
      return yield* new AuthUnauthorizedError({ message: "Unauthorized" });
    }

    if (viewer.value.must_change_password && options.allowPasswordChangeRequired !== true) {
      return yield* new AuthForbiddenError({ message: "Password change required" });
    }

    return viewer.value;
  },
);

export const persistSessionResponse = Effect.fn("Http.persistSessionResponse")(function* (
  token: string,
  body: LoginResponse,
) {
  const config = yield* AppConfig;
  const response = yield* encodeSchemaJsonResponse(LoginResponseSchema, body);

  return HttpServerResponse.setCookieUnsafe(response, config.sessionCookieName, token, {
    httpOnly: true,
    maxAge: Duration.days(config.sessionDurationDays),
    path: "/",
    sameSite: "lax",
    secure: config.sessionCookieSecure,
  });
});
