import { Effect } from "effect";

import { AuthError } from "../features/auth/service.ts";
import {
  compactLogAnnotations,
  durationMsSince,
  errorLogAnnotations,
} from "../lib/logging.ts";
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
    const mapped = mapError(result.error);
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

function mapError(
  error: unknown,
): { message: string; status: number; headers?: Record<string, string> } {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const tagged = error as { _tag: string; message: string };

    switch (tagged._tag) {
      case "RequestValidationError":
      case "ConfigValidationError":
        return { message: tagged.message, status: 400 };
      case "StoredConfigCorruptError":
        return { message: tagged.message, status: 500 };
      case "EpisodeStreamRangeError": {
        const rangeError = error as unknown as {
          fileSize: number;
          message: string;
          status: 416;
        };
        return {
          headers: { "Content-Range": `bytes */${rangeError.fileSize}` },
          message: rangeError.message,
          status: 416,
        };
      }
      case "AuthError":
        return {
          message: tagged.message,
          status: error instanceof AuthError ? error.status : 500,
        };
      case "AnimeNotFoundError":
      case "DownloadNotFoundError":
      case "OperationsAnimeNotFoundError":
      case "ProfileNotFoundError":
        return { message: tagged.message, status: 404 };
      case "OperationsInputError":
        return { message: tagged.message, status: 400 };
      case "AnimeConflictError":
      case "DownloadConflictError":
      case "OperationsConflictError":
        return { message: tagged.message, status: 409 };
      case "AnimePathError":
        return { message: tagged.message, status: 400 };
      case "ExternalCallError":
        return { message: "External service unavailable", status: 503 };
      case "DatabaseError":
        return { message: tagged.message, status: 500 };
    }
  }

  if (error instanceof Error) {
    return { message: error.message, status: 500 };
  }

  return { message: "Unexpected server error", status: 500 };
}
