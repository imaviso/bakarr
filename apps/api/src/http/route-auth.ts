import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { AppConfig } from "../config.ts";
import { AuthError } from "../features/auth/errors.ts";
import { AuthSessionService } from "../features/auth/session-service.ts";
import { mapRouteError } from "./route-errors.ts";
import type { RouteErrorResponse } from "./route-types.ts";

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
    const apiKey = headerApiKey
      ? headerApiKey
      : authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : undefined;
    const viewer = yield* Effect.flatMap(AuthSessionService, (auth) =>
      auth.resolveViewer(sessionToken, apiKey),
    );

    if (!viewer) {
      return yield* new AuthError({ message: "Unauthorized", status: 401 });
    }

    return viewer;
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
    maxAge: config.sessionDurationDays * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: config.sessionCookieSecure,
  });
});
