import { Effect, Schema } from "effect";
import { setCookie } from "hono/cookie";

import {
  type AuthUser,
  AuthUserSchema,
} from "../../../../packages/shared/src/index.ts";
import { AppConfig } from "../config.ts";
import { AuthError } from "../features/auth/service.ts";
import type { RunEffect } from "./route-types.ts";

export function getApiKey(
  headerApiKey: string | undefined,
  authorization: string | undefined,
) {
  if (headerApiKey) {
    return headerApiKey;
  }

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return undefined;
}

export function requireViewerEffect(
  c: { get: (key: "viewer") => AuthUser | null },
): Effect.Effect<AuthUser, AuthError> {
  const viewer = c.get("viewer");

  if (!viewer) {
    return Effect.fail(new AuthError({ message: "Unauthorized", status: 401 }));
  }

  return Effect.succeed(viewer);
}

export async function persistSession(
  c: Parameters<typeof setCookie>[0],
  runEffect: RunEffect,
  token: string,
) {
  const config = await runEffect(Effect.map(AppConfig, (value) => value));

  const forwardedProto = c.req.header("x-forwarded-proto");
  const isSecure = forwardedProto === "https" ||
    c.req.url.startsWith("https://");

  setCookie(c, config.sessionCookieName, token, {
    httpOnly: true,
    maxAge: config.sessionDurationDays * 24 * 60 * 60,
    path: "/",
    sameSite: "Lax",
    secure: isSecure,
  });
}

export function getOptionalViewer(
  c: { get: (key: string) => unknown },
): AuthUser | null {
  const viewer = c.get("viewer");

  if (!isAuthUser(viewer)) {
    return null;
  }

  return viewer;
}

export function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    created_at?: unknown;
    id?: unknown;
    must_change_password?: unknown;
    updated_at?: unknown;
    username?: unknown;
  };

  if (
    typeof candidate.id !== "number" || !Number.isFinite(candidate.id) ||
    typeof candidate.username !== "string" ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string" ||
    typeof candidate.must_change_password !== "boolean"
  ) {
    return false;
  }

  const result = Schema.decodeUnknownEither(AuthUserSchema)(value);
  return result._tag === "Right";
}
