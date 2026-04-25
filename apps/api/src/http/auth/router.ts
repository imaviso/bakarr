import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import {
  ApiKeyLoginRequestSchema,
  ChangePasswordRequestSchema,
  LoginRequestSchema,
} from "@packages/shared/index.ts";
import { AppConfig } from "@/config/schema.ts";
import { AuthCredentialService } from "@/features/auth/credential-service.ts";
import { AuthSessionService } from "@/features/auth/session-service.ts";
import {
  decodeJsonBodyWithLabel,
  routeResponse,
  withAuthViewer,
} from "@/http/shared/router-helpers.ts";
import { mapAuthRouteError, persistSessionResponse } from "@/http/shared/route-auth.ts";

export const authRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/login",
    routeResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(LoginRequestSchema, "login");
        return yield* Effect.flatMap(AuthSessionService, (auth) => auth.login(body));
      }),
      (value) => persistSessionResponse(value.token, value.response),
      mapAuthRouteError,
    ),
  ),
  HttpRouter.post(
    "/login/api-key",
    routeResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ApiKeyLoginRequestSchema, "API key login");
        return yield* Effect.flatMap(AuthSessionService, (auth) => auth.loginWithApiKey(body));
      }),
      (value) => persistSessionResponse(value.token, value.response),
      mapAuthRouteError,
    ),
  ),
  HttpRouter.post(
    "/logout",
    routeResponse(
      Effect.gen(function* () {
        const config = yield* AppConfig;
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = request.cookies[config.sessionCookieName];
        yield* Effect.flatMap(AuthSessionService, (auth) => auth.logout(token));
      }),
      () =>
        Effect.gen(function* () {
          const config = yield* AppConfig;
          const response = yield* HttpServerResponse.json({
            data: null,
            success: true,
          });

          return HttpServerResponse.expireCookie(response, config.sessionCookieName, {
            path: "/",
          });
        }),
      mapAuthRouteError,
    ),
  ),
  HttpRouter.get(
    "/me",
    routeResponse(
      withAuthViewer((viewer) => Effect.succeed(viewer)),
      (viewer) => HttpServerResponse.json(viewer),
      mapAuthRouteError,
    ),
  ),
  HttpRouter.get(
    "/api-key",
    routeResponse(
      withAuthViewer((viewer) =>
        Effect.flatMap(AuthCredentialService, (auth) => auth.getApiKey(viewer.id)),
      ),
      (value) => HttpServerResponse.json(value),
      mapAuthRouteError,
    ),
  ),
  HttpRouter.post(
    "/api-key/regenerate",
    routeResponse(
      withAuthViewer((viewer) =>
        Effect.flatMap(AuthCredentialService, (auth) => auth.regenerateApiKey(viewer.id)),
      ),
      (value) => HttpServerResponse.json(value),
      mapAuthRouteError,
    ),
  ),
  HttpRouter.put(
    "/password",
    routeResponse(
      withAuthViewer((viewer) =>
        Effect.gen(function* () {
          const body = yield* decodeJsonBodyWithLabel(
            ChangePasswordRequestSchema,
            "change password",
          );
          yield* Effect.flatMap(AuthCredentialService, (auth) =>
            auth.changePassword(viewer.id, body),
          );
        }),
      ),
      () => HttpServerResponse.json({ data: null, success: true }),
      mapAuthRouteError,
    ),
  ),
);
