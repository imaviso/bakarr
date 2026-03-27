import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

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

export const persistSessionResponse = Effect.fn("Http.persistSessionResponse")(function* (
  token: string,
  body: unknown,
) {
  const config = yield* AppConfig;
  const request = yield* HttpServerRequest.HttpServerRequest;
  const isSecure = request.headers["x-forwarded-proto"] === "https" || request.url.startsWith("https://");
  const response = yield* HttpServerResponse.json(body);

  return HttpServerResponse.unsafeSetCookie(response, config.sessionCookieName, token, {
    httpOnly: true,
    maxAge: config.sessionDurationDays * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: isSecure,
  });
});

export const clearSessionResponse = Effect.fn("Http.clearSessionResponse")(function* () {
  const config = yield* AppConfig;
  const response = yield* HttpServerResponse.json({
    data: null,
    success: true,
  });

  return HttpServerResponse.expireCookie(response, config.sessionCookieName, {
    path: "/",
  });
});
