import { Effect } from "effect";

import { AuthError } from "../features/auth/service.ts";
import {
  compactLogAnnotations,
  durationMsSince,
  errorLogAnnotations,
} from "../lib/logging.ts";
import { getOptionalViewer } from "./route-auth.ts";
import type { RunEffect } from "./route-types.ts";

export async function runRoute<A, E, R>(
  c: {
    get: (key: string) => unknown;
    json: (data: unknown, status?: number) => Response;
    req: { method: string; path: string };
    text: (text: string, status?: number) => Response;
  },
  runEffect: RunEffect,
  effect: Effect.Effect<A, E, R>,
  onSuccess: (value: A) => Response | Promise<Response>,
): Promise<Response> {
  const viewer = getOptionalViewer(c);
  const startedAt = performance.now();

  const result = await runEffect(
    withRequestLogContext(
      c,
      effect.pipe(
        Effect.match({
          onFailure: (error) => ({ error, ok: false as const }),
          onSuccess: (value) => ({ ok: true as const, value }),
        }),
      ),
      compactLogAnnotations({ viewerId: viewer?.id }),
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

export function shouldLogRequest(path: string) {
  return path === "/health" || path.startsWith("/api/");
}

function mapError(error: unknown): { message: string; status: number } {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const tagged = error as { _tag: string; message: string };

    switch (tagged._tag) {
      case "RequestValidationError":
      case "ConfigValidationError":
        return { message: tagged.message, status: 400 };
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
        return { message: tagged.message, status: 409 };
      case "DatabaseError":
        return { message: tagged.message, status: 500 };
    }
  }

  if (error instanceof Error) {
    return { message: error.message, status: 500 };
  }

  return { message: "Unexpected server error", status: 500 };
}
