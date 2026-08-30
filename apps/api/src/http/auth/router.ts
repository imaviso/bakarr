import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Option } from "effect";

import {
  ApiKeyLoginRequestSchema,
  ApiKeyResponseSchema,
  AuthUserSchema,
  ChangePasswordRequestSchema,
  LoginRequestSchema,
} from "@packages/shared/index.ts";
import { AppConfig } from "@/app/config/schema.ts";
import { AuthCredentialService } from "@/features/auth/credential-service.ts";
import { AuthSessionService } from "@/features/auth/session-service.ts";
import {
  decodeJsonBodyWithLabel,
  routeResponse,
  schemaJsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";
import { persistSessionResponse, requireViewerFromHttpRequest } from "@/http/shared/route-auth.ts";

export const authRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/login",
    routeResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(LoginRequestSchema, "login");
        // Socket remote address only — never a spoofable forwarded header.
        const clientKey = Option.getOrElse(
          (yield* HttpServerRequest.HttpServerRequest).remoteAddress,
          () => "unknown",
        );
        const auth = yield* AuthSessionService;
        return yield* auth.login(body, clientKey);
      }),
      (value) => persistSessionResponse(value.token, value.response),
    ),
  ),
  HttpRouter.post(
    "/login/api-key",
    routeResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ApiKeyLoginRequestSchema, "API key login");
        const clientKey = Option.getOrElse(
          (yield* HttpServerRequest.HttpServerRequest).remoteAddress,
          () => "unknown",
        );
        const auth = yield* AuthSessionService;
        return yield* auth.loginWithApiKey(body, clientKey);
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
        const auth = yield* AuthSessionService;
        yield* auth.logout(token);
      }),
      () =>
        Effect.gen(function* () {
          const config = yield* AppConfig;
          const response = yield* successResponse();

          return HttpServerResponse.expireCookie(response, config.sessionCookieName, {
            httpOnly: true,
            path: "/",
            sameSite: "lax",
            secure: config.sessionCookieSecure,
          });
        }),
    ),
  ),
  HttpRouter.get(
    "/me",
    routeResponse(
      requireViewerFromHttpRequest({ allowPasswordChangeRequired: true }),
      schemaJsonResponse(AuthUserSchema),
    ),
  ),
  HttpRouter.get(
    "/api-key",
    routeResponse(
      requireViewerFromHttpRequest().pipe(
        Effect.flatMap((viewer) =>
          Effect.gen(function* () {
            const auth = yield* AuthCredentialService;
            return yield* auth.getApiKey(viewer.id);
          }),
        ),
      ),
      schemaJsonResponse(ApiKeyResponseSchema),
    ),
  ),
  HttpRouter.post(
    "/api-key/regenerate",
    routeResponse(
      requireViewerFromHttpRequest().pipe(
        Effect.flatMap((viewer) =>
          Effect.gen(function* () {
            const auth = yield* AuthCredentialService;
            return yield* auth.regenerateApiKey(viewer.id);
          }),
        ),
      ),
      schemaJsonResponse(ApiKeyResponseSchema),
    ),
  ),
  HttpRouter.put(
    "/password",
    routeResponse(
      requireViewerFromHttpRequest({ allowPasswordChangeRequired: true }).pipe(
        Effect.flatMap((viewer) =>
          Effect.gen(function* () {
            const body = yield* decodeJsonBodyWithLabel(
              ChangePasswordRequestSchema,
              "change password",
            );
            const auth = yield* AuthCredentialService;
            yield* auth.changePassword(viewer.id, body);
          }),
        ),
      ),
      successResponse,
    ),
  ),
);
