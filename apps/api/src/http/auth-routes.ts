import { Effect } from "effect";
import type { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";

import { AppConfig } from "../config.ts";
import { AuthService } from "../features/auth/service.ts";
import {
  ApiKeyLoginRequestSchema,
  ChangePasswordRequestSchema,
  LoginRequestSchema,
} from "./request-schemas.ts";
import type { AppVariables, RunEffect } from "./route-helpers.ts";
import {
  persistSession,
  requireViewer,
  runRoute,
  withJsonBody,
} from "./route-helpers.ts";

export function registerAuthRoutes(
  app: Hono<{ Variables: AppVariables }>,
  runEffect: RunEffect,
) {
  app.post("/api/auth/login", async (c) => {
    const result = await runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        LoginRequestSchema,
        "auth login",
        (body) => Effect.flatMap(AuthService, (auth) => auth.login(body)),
      ),
      async (value) => {
        await persistSession(c, runEffect, value.token);
        return c.json(value.response);
      },
    );

    return result;
  });

  app.post("/api/auth/login/api-key", (c) => {
    return runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        ApiKeyLoginRequestSchema,
        "api key login",
        (body) =>
          Effect.flatMap(AuthService, (auth) => auth.loginWithApiKey(body)),
      ),
      async (value) => {
        await persistSession(c, runEffect, value.token);
        return c.json(value.response);
      },
    );
  });

  app.post("/api/auth/logout", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.gen(function* () {
        const sessionCookieName = yield* Effect.map(
          AppConfig,
          (config) => config.sessionCookieName,
        );
        const token = getCookie(c, sessionCookieName);
        yield* Effect.flatMap(AuthService, (auth) => auth.logout(token));
        deleteCookie(c, sessionCookieName, { path: "/" });
      }),
      () => c.json({ data: null, success: true }),
    ));

  app.get("/api/auth/me", (c) => c.json(requireViewer(c)));

  app.get("/api/auth/api-key", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(
        AuthService,
        (auth) => auth.getApiKey(requireViewer(c).id),
      ),
      (value) => c.json(value),
    ));

  app.post("/api/auth/api-key/regenerate", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(AuthService, (auth) =>
        auth.regenerateApiKey(requireViewer(c).id)),
      (value) =>
        c.json(value),
    ));

  app.put("/api/auth/password", (c) => {
    return runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        ChangePasswordRequestSchema,
        "change password",
        (body) =>
          Effect.flatMap(
            AuthService,
            (auth) => auth.changePassword(requireViewer(c).id, body),
          ),
      ),
      () => c.json({ data: null, success: true }),
    );
  });
}
