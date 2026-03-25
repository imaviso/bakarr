import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import {
  ApiKeyLoginRequestSchema,
  ChangePasswordRequestSchema,
  LoginRequestSchema,
} from "../../../../packages/shared/src/index.ts";
import { AppConfig } from "../config.ts";
import { AuthService } from "../features/auth/service.ts";
import { requireViewerFromHttpRequest } from "./route-auth.ts";
import { routeResponse } from "./router-helpers.ts";

const persistSessionResponse = Effect.fn("Http.persistSessionResponse")(function* (
  token: string,
  body: unknown,
) {
  const config = yield* AppConfig;
  const request = yield* HttpServerRequest.HttpServerRequest;
  const isSecure =
    request.headers["x-forwarded-proto"] === "https" || request.url.startsWith("https://");
  const response = yield* HttpServerResponse.json(body);

  return HttpServerResponse.unsafeSetCookie(response, config.sessionCookieName, token, {
    httpOnly: true,
    maxAge: config.sessionDurationDays * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: isSecure,
  });
});

export const authRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/login",
    routeResponse(
      Effect.gen(function* () {
        const body = yield* HttpServerRequest.schemaBodyJson(LoginRequestSchema);
        return yield* Effect.flatMap(AuthService, (auth) => auth.login(body));
      }),
      (value) => persistSessionResponse(value.token, value.response),
    ),
  ),
  HttpRouter.post(
    "/login/api-key",
    routeResponse(
      Effect.gen(function* () {
        const body = yield* HttpServerRequest.schemaBodyJson(ApiKeyLoginRequestSchema);
        return yield* Effect.flatMap(AuthService, (auth) => auth.loginWithApiKey(body));
      }),
      (value) => persistSessionResponse(value.token, value.response),
    ),
  ),
  HttpRouter.post(
    "/logout",
    routeResponse(
      Effect.gen(function* () {
        const config = yield* AppConfig;
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = request.cookies[config.sessionCookieName];
        yield* Effect.flatMap(AuthService, (auth) => auth.logout(token));
        return config.sessionCookieName;
      }),
      (cookieName) =>
        Effect.gen(function* () {
          const response = yield* HttpServerResponse.json({
            data: null,
            success: true,
          });
          return HttpServerResponse.expireCookie(response, cookieName, {
            path: "/",
          });
        }),
    ),
  ),
  HttpRouter.get(
    "/me",
    routeResponse(requireViewerFromHttpRequest(), (viewer) => HttpServerResponse.json(viewer)),
  ),
  HttpRouter.get(
    "/api-key",
    routeResponse(
      Effect.flatMap(requireViewerFromHttpRequest(), (viewer) =>
        Effect.flatMap(AuthService, (auth) => auth.getApiKey(viewer.id)),
      ),
      (value) => HttpServerResponse.json(value),
    ),
  ),
  HttpRouter.post(
    "/api-key/regenerate",
    routeResponse(
      Effect.flatMap(requireViewerFromHttpRequest(), (viewer) =>
        Effect.flatMap(AuthService, (auth) => auth.regenerateApiKey(viewer.id)),
      ),
      (value) => HttpServerResponse.json(value),
    ),
  ),
  HttpRouter.put(
    "/password",
    routeResponse(
      Effect.gen(function* () {
        const body = yield* HttpServerRequest.schemaBodyJson(ChangePasswordRequestSchema);
        const viewer = yield* requireViewerFromHttpRequest();
        yield* Effect.flatMap(AuthService, (auth) => auth.changePassword(viewer.id, body));
      }),
      () => HttpServerResponse.json({ data: null, success: true }),
    ),
  ),
);
