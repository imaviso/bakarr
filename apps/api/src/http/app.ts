import { Effect } from "effect";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";

import { AppConfig } from "../config.ts";
import { AuthService } from "../features/auth/service.ts";
import {
  compactLogAnnotations,
  durationMsSince,
  errorLogAnnotations,
} from "../lib/logging.ts";
import { recordHttpRequestMetrics } from "../lib/metrics.ts";
import { registerAnimeRoutes } from "./anime-routes.ts";
import { registerAuthRoutes } from "./auth-routes.ts";
import { registerOperationsRoutes } from "./operations-routes.ts";
import {
  type AppVariables,
  getApiKey,
  type RunEffect,
  shouldLogRequest,
  withRequestLogContext,
} from "./route-helpers.ts";
import { registerSystemRoutes } from "./system-routes.ts";

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/login/api-key",
  "/api/auth/logout",
  "/api/stream/",
  "/api/system/health/live",
  "/api/system/health/ready",
]);

const reportMiddlewareEffectFailure = Effect.fn(
  "Http.reportMiddlewareEffectFailure",
)(function* (context: string, error: unknown) {
  yield* Effect.logWarning("http middleware effect failed").pipe(
    Effect.annotateLogs(
      compactLogAnnotations({
        component: "http",
        context,
        event: "http.middleware.effect.failed",
        ...errorLogAnnotations(error),
      }),
    ),
  );
});

export function createApp(runEffect: RunEffect) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", async (c, next) => {
    if (!shouldLogRequest(c.req.path)) {
      await next();
      return;
    }

    c.set("requestId", crypto.randomUUID());
    const startedAt = performance.now();
    let requestError: unknown;

    try {
      await next();
    } catch (error) {
      requestError = error;
      throw error;
    } finally {
      const statusCode = requestError ? 500 : c.res.status;
      const logEffect = statusCode >= 500
        ? Effect.logError("http request completed")
        : statusCode >= 400
        ? Effect.logWarning("http request completed")
        : Effect.logInfo("http request completed");

      await runEffect(
        withRequestLogContext(
          c,
          logEffect.pipe(
            Effect.annotateLogs(
              compactLogAnnotations({
                component: "http",
                durationMs: durationMsSince(startedAt),
                event: "http.request.completed",
                statusCode,
                ...errorLogAnnotations(requestError),
              }),
            ),
          ),
        ),
      ).catch((error) =>
        runEffect(reportMiddlewareEffectFailure("request-log", error)).catch(
          () => undefined,
        )
      );

      if (c.req.path !== "/api/metrics") {
        await runEffect(
          withRequestLogContext(
            c,
            recordHttpRequestMetrics({
              durationMs: durationMsSince(startedAt),
              method: c.req.method,
              route: c.req.routePath || c.req.path,
              status: statusCode,
            }),
          ),
        ).catch((error) =>
          runEffect(reportMiddlewareEffectFailure("request-metrics", error))
            .catch(() => undefined)
        );
      }
    }
  });

  app.use("/api/*", async (c, next) => {
    const path = c.req.path;

    if (PUBLIC_API_PATHS.has(path) || path.startsWith("/api/stream/")) {
      await next();
      return;
    }

    const sessionCookieName = await runEffect(
      withRequestLogContext(
        c,
        Effect.map(AppConfig, (config) => config.sessionCookieName),
      ),
    );
    const sessionToken = getCookie(c, sessionCookieName);
    const apiKey = getApiKey(
      c.req.header("x-api-key"),
      c.req.header("authorization"),
    );

    const viewer = await runEffect(
      withRequestLogContext(
        c,
        Effect.flatMap(
          AuthService,
          (auth) => auth.resolveViewer(sessionToken, apiKey),
        ),
      ),
    );

    if (!viewer) {
      c.set("viewer", null);
      return c.text("Unauthorized", 401);
    }

    c.set("viewer", viewer);
    await next();
  });

  app.get("/", (c) =>
    c.json({
      name: "bakarr-api",
      routes: [
        "/health",
        "/api/auth/login",
        "/api/system/status",
        "/api/library/stats",
        "/api/events",
      ],
    }));

  registerAuthRoutes(app, runEffect);
  registerSystemRoutes(app, runEffect);
  registerAnimeRoutes(app, runEffect);
  registerOperationsRoutes(app, runEffect);

  return app;
}
