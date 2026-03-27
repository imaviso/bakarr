import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import {
  ApiKeyLoginRequestSchema,
  ChangePasswordRequestSchema,
  LoginRequestSchema,
} from "../../../../packages/shared/src/index.ts";
import { AppConfig } from "../config.ts";
import { AuthService } from "../features/auth/service.ts";
import { decodeJsonBodyWithLabel, routeResponse, withAuthViewer } from "./router-helpers.ts";
import { clearSessionResponse, persistSessionResponse } from "./route-auth.ts";

export const authRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/login",
    routeResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(LoginRequestSchema, "login");
        return yield* Effect.flatMap(AuthService, (auth) => auth.login(body));
      }),
      (value) => persistSessionResponse(value.token, value.response),
    ),
  ),
  HttpRouter.post(
    "/login/api-key",
    routeResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ApiKeyLoginRequestSchema, "API key login");
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
        return undefined;
      }),
      () => clearSessionResponse(),
    ),
  ),
  HttpRouter.get(
    "/me",
    routeResponse(
      withAuthViewer((viewer) => Effect.succeed(viewer)),
      (viewer) => HttpServerResponse.json(viewer),
    ),
  ),
  HttpRouter.get(
    "/api-key",
    routeResponse(
      withAuthViewer((viewer) => Effect.flatMap(AuthService, (auth) => auth.getApiKey(viewer.id))),
      (value) => HttpServerResponse.json(value),
    ),
  ),
  HttpRouter.post(
    "/api-key/regenerate",
    routeResponse(
      withAuthViewer((viewer) =>
        Effect.flatMap(AuthService, (auth) => auth.regenerateApiKey(viewer.id)),
      ),
      (value) => HttpServerResponse.json(value),
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
          yield* Effect.flatMap(AuthService, (auth) => auth.changePassword(viewer.id, body));
        }),
      ),
      () => HttpServerResponse.json({ data: null, success: true }),
    ),
  ),
);
