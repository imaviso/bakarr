import { Effect } from "effect";

import {
  compactLogAnnotations,
  durationMsSince,
  errorLogAnnotations,
} from "../lib/logging.ts";
import { mapRouteError } from "./route-errors.ts";
import { getOptionalViewer } from "./route-auth.ts";
import type { RunEffect } from "./route-types.ts";

type RouteEffect<A, E> = Parameters<RunEffect>[0] extends
  Effect.Effect<infer _A, infer _E, infer R> ? Effect.Effect<A, E, R>
  : never;

export async function runRoute<A, E>(
  c: {
    get: (key: string) => unknown;
    json: (data: unknown, status?: number) => Response;
    req: { method: string; path: string };
    text: (text: string, status?: number) => Response;
  },
  runEffect: RunEffect,
  effect: RouteEffect<A, E>,
  onSuccess: (value: A) => Response | Promise<Response>,
): Promise<Response> {
  const viewer = getOptionalViewer(c);
  const startedAt = performance.now();
  const requestAttributes = compactLogAnnotations({ viewerId: viewer?.id });

  const result = await runEffect(
    withRequestSpan(
      c,
      withRequestLogContext(
        c,
        effect.pipe(
          Effect.match({
            onFailure: (error) => ({ error, ok: false as const }),
            onSuccess: (value) => ({ ok: true as const, value }),
          }),
        ),
        requestAttributes,
      ),
      requestAttributes,
    ),
  );

  if (!result.ok) {
    const mapped = mapRouteError(result.error);
    const logEffect = mapped.status >= 500
      ? Effect.logError("route handler failed")
      : Effect.logWarning("route handler failed");

    await runEffect(
      withRequestLogContext(
        c,
        logEffect.pipe(
          Effect.annotateLogs(
            compactLogAnnotations({
              component: "http",
              durationMs: durationMsSince(startedAt),
              event: "http.route.failed",
              statusCode: mapped.status,
              viewerId: viewer?.id,
              ...errorLogAnnotations(result.error),
            }),
          ),
        ),
      ),
    ).catch(() => undefined);

    if (mapped.headers) {
      return new Response(mapped.message, {
        status: mapped.status,
        headers: { "Content-Type": "text/plain", ...mapped.headers },
      });
    }

    return c.text(mapped.message, mapped.status);
  }

  return onSuccess(result.value);
}

export function withRequestLogContext<A, E, R>(
  c: { get: (key: string) => unknown; req: { method: string; path: string } },
  effect: Effect.Effect<A, E, R>,
  extraAnnotations: Record<string, unknown> = {},
) {
  return effect.pipe(
    Effect.annotateLogs(
      compactLogAnnotations({
        httpMethod: c.req.method,
        httpPath: c.req.path,
        requestId: c.get("requestId"),
        ...extraAnnotations,
      }),
    ),
  );
}

export function withRequestSpan<A, E, R>(
  c: { get: (key: string) => unknown; req: { method: string; path: string } },
  effect: Effect.Effect<A, E, R>,
  extraAttributes: Record<string, unknown> = {},
) {
  return effect.pipe(
    Effect.withSpan("http.route", {
      attributes: compactLogAnnotations({
        httpMethod: c.req.method,
        httpPath: c.req.path,
        requestId: c.get("requestId"),
        ...extraAttributes,
      }),
    }),
  );
}

export function shouldLogRequest(path: string) {
  return path === "/health" || path.startsWith("/api/");
}
