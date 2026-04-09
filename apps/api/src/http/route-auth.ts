import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Duration, Effect, Either, Option, Schema } from "effect";

import { AppConfig } from "@/config.ts";
import { AuthError } from "@/features/auth/errors.ts";
import { AuthSessionService } from "@/features/auth/session-service.ts";
import { mapRouteError } from "@/http/route-errors.ts";
import type { RouteErrorResponse } from "@/http/route-types.ts";

const decodeAuthRouteError = Schema.decodeUnknownEither(AuthError);

export function mapAuthRouteError(error: unknown): RouteErrorResponse {
  const authError = decodeAuthRouteError(error);

  if (Either.isRight(authError)) {
    return {
      message: authError.right.message,
      status: authError.right.status,
    };
  }

  return mapRouteError(error);
}

function extractApiKeyFromHeaders(headers: Readonly<Record<string, string | undefined>>) {
  const headerApiKey = headers["x-api-key"];

  if (headerApiKey) {
    return headerApiKey;
  }

  const authorization = headers["authorization"];
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
}

export const requireViewerFromHttpRequest = Effect.fn("Http.requireViewerFromHttpRequest")(
  function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* AppConfig;
    const sessionToken = request.cookies[config.sessionCookieName];
    const apiKey = extractApiKeyFromHeaders(request.headers);

    const viewer = yield* Effect.flatMap(AuthSessionService, (auth) =>
      auth.resolveViewer(sessionToken, apiKey),
    );

    if (Option.isNone(viewer)) {
      return yield* new AuthError({ message: "Unauthorized", status: 401 });
    }

    return viewer.value;
  },
);

export const persistSessionResponse = Effect.fn("Http.persistSessionResponse")(function* (
  token: string,
  body: unknown,
) {
  const config = yield* AppConfig;
  const response = yield* HttpServerResponse.json(body);

  return HttpServerResponse.unsafeSetCookie(response, config.sessionCookieName, token, {
    httpOnly: true,
    maxAge: Duration.days(config.sessionDurationDays),
    path: "/",
    sameSite: "lax",
    secure: config.sessionCookieSecure,
  });
});
