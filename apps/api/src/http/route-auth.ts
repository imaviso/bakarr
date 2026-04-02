import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Duration, Effect, Option } from "effect";

import { AppConfig } from "@/config.ts";
import { AuthError } from "@/features/auth/errors.ts";
import { AuthSessionService } from "@/features/auth/session-service.ts";
import { mapRouteError } from "@/http/route-errors.ts";
import type { RouteErrorResponse } from "@/http/route-types.ts";

export function mapAuthRouteError(error: unknown): RouteErrorResponse {
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "AuthError"
  ) {
    return {
      message: (error as AuthError).message,
      status: (error as AuthError).status,
    };
  }

  return mapRouteError(error);
}

export const requireViewerFromHttpRequest = Effect.fn("Http.requireViewerFromHttpRequest")(
  function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* AppConfig;
    const sessionToken = request.cookies[config.sessionCookieName];
    const headerApiKey = request.headers["x-api-key"];
    const authorization = request.headers["authorization"];
    let apiKey: string | undefined;

    if (headerApiKey) {
      apiKey = headerApiKey;
    } else if (authorization?.startsWith("Bearer ")) {
      apiKey = authorization.slice("Bearer ".length);
    }

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
