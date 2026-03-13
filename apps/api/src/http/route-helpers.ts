import { Effect, ParseResult, Schema } from "effect";
import { setCookie } from "hono/cookie";
import type { FileSystemShape } from "../lib/filesystem.ts";

import type {
  AuthUser,
  Config,
  QualityProfile,
} from "../../../../packages/shared/src/index.ts";
import { AppConfig } from "../config.ts";
import type { AddAnimeInput } from "../features/anime/service.ts";
import { AuthError } from "../features/auth/service.ts";
import {
  compactLogAnnotations,
  durationMsSince,
  errorLogAnnotations,
} from "../lib/logging.ts";
import {
  AddAnimeInputSchema,
  ConfigSchema,
  CreateReleaseProfileSchema,
  QualityProfileSchema,
  UpdateReleaseProfileSchema,
} from "./request-schemas.ts";

export type RunEffect = <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;

export type AppVariables = {
  requestId: string;
  viewer: AuthUser | null;
};

export class RequestValidationError
  extends Schema.TaggedError<RequestValidationError>()(
    "RequestValidationError",
    {
      message: Schema.String,
      status: Schema.Literal(400),
    },
  ) {}

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

export function getApiKey(
  headerApiKey: string | undefined,
  authorization: string | undefined,
  queryApiKey: string | undefined,
) {
  if (headerApiKey) {
    return headerApiKey;
  }

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return queryApiKey;
}

export function requireViewer(c: { get: (key: "viewer") => AuthUser | null }) {
  const viewer = c.get("viewer");

  if (!viewer) {
    throw new AuthError({ message: "Unauthorized", status: 401 });
  }

  return viewer;
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

export async function persistSession(
  c: Parameters<typeof setCookie>[0],
  runEffect: RunEffect,
  token: string,
) {
  const config = await runEffect(Effect.map(AppConfig, (value) => value));

  setCookie(c, config.sessionCookieName, token, {
    httpOnly: true,
    maxAge: config.sessionDurationDays * 24 * 60 * 60,
    path: "/",
    sameSite: "Lax",
  });
}

export function browsePath(fs: FileSystemShape, path: string) {
  return Effect.gen(function* () {
    const entries: Array<
      { is_directory: boolean; name: string; path: string; size?: number }
    > = [];

    const dirEntries = yield* fs.readDir(path).pipe(
      Effect.catchAll(() => Effect.succeed<Deno.DirEntry[]>([])),
    );

    for (const entry of dirEntries) {
      const fullPath = `${path.replace(/\/$/, "")}/${entry.name}`;
      const stats = yield* fs.stat(fullPath).pipe(
        Effect.catchAll(() =>
          Effect.succeed(
            {
              isFile: false,
              isDirectory: entry.isDirectory,
            } as unknown as Deno.FileInfo,
          )
        ),
      );
      entries.push({
        is_directory: entry.isDirectory,
        name: entry.name,
        path: fullPath,
        size: stats.isFile ? stats.size : undefined,
      });
    }

    entries.sort((left, right) =>
      Number(right.is_directory) - Number(left.is_directory) ||
      left.name.localeCompare(right.name)
    );

    return {
      current_path: path,
      entries,
      parent_path: path === "."
        ? undefined
        : path.split("/").slice(0, -1).join("/") || "/",
    };
  });
}

export function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function guessContentType(name: string) {
  const lower = name.toLowerCase();

  if (lower.endsWith(".mp4")) {
    return "video/mp4";
  }

  if (lower.endsWith(".webm")) {
    return "video/webm";
  }

  if (lower.endsWith(".mov")) {
    return "video/quicktime";
  }

  if (lower.endsWith(".avi")) {
    return "video/x-msvideo";
  }

  return "video/x-matroska";
}

export function withJsonBody<A, I, B, E, R>(
  c: { req: { json: () => Promise<unknown> } },
  schema: Schema.Schema<A, I>,
  label: string,
  effect: (body: A) => Effect.Effect<B, E, R>,
): Effect.Effect<B, E | RequestValidationError, R> {
  return parseJsonBody(c, schema, label).pipe(Effect.flatMap(effect));
}

export function withOptionalJsonBody<A, I, B, E, R>(
  c: { req: { json: () => Promise<unknown> } },
  schema: Schema.Schema<A, I>,
  label: string,
  effect: (body: A) => Effect.Effect<B, E, R>,
): Effect.Effect<B, E | RequestValidationError, R> {
  return parseOptionalJsonBody(c, schema, label).pipe(Effect.flatMap(effect));
}

export function withParams<A, I, B, E, R>(
  c: { req: { param: () => Record<string, string> } },
  schema: Schema.Schema<A, I>,
  label: string,
  effect: (params: A) => Effect.Effect<B, E, R>,
): Effect.Effect<B, E | RequestValidationError, R> {
  return parseParams(c, schema, label).pipe(Effect.flatMap(effect));
}

export function withQuery<A, I, B, E, R>(
  c: { req: { url: string } },
  schema: Schema.Schema<A, I>,
  label: string,
  effect: (query: A) => Effect.Effect<B, E, R>,
): Effect.Effect<B, E | RequestValidationError, R> {
  return parseQuery(c, schema, label).pipe(Effect.flatMap(effect));
}

export function withParamsAndBody<PA, PI, BA, BI, B, E, R>(
  c: {
    req: { json: () => Promise<unknown>; param: () => Record<string, string> };
  },
  paramsSchema: Schema.Schema<PA, PI>,
  bodySchema: Schema.Schema<BA, BI>,
  label: string,
  effect: (params: PA, body: BA) => Effect.Effect<B, E, R>,
): Effect.Effect<B, E | RequestValidationError, R> {
  return Effect.all({
    body: parseJsonBody(c, bodySchema, label),
    params: parseParams(c, paramsSchema, label),
  }).pipe(Effect.flatMap(({ body, params }) => effect(params, body)));
}

export function parseJsonBody<A, I>(
  c: { req: { json: () => Promise<unknown> } },
  schema: Schema.Schema<A, I>,
  label: string,
): Effect.Effect<A, RequestValidationError> {
  return Effect.tryPromise({
    try: () => c.req.json(),
    catch: () =>
      RequestValidationError.make({
        message: `Invalid JSON for ${label}`,
        status: 400,
      }),
  }).pipe(
    Effect.flatMap((json) =>
      Schema.decodeUnknown(schema)(json).pipe(
        Effect.mapError((error) =>
          RequestValidationError.make({
            message: formatValidationErrorMessage(
              `Invalid request body for ${label}`,
              error,
            ),
            status: 400,
          })
        ),
      )
    ),
  );
}

export function parseOptionalJsonBody<A, I>(
  c: { req: { json: () => Promise<unknown> } },
  schema: Schema.Schema<A, I>,
  label: string,
): Effect.Effect<A, RequestValidationError> {
  return Effect.tryPromise({
    try: () => c.req.json().catch(() => ({})),
    catch: () => ({}),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknown(schema)),
    Effect.mapError((error) =>
      RequestValidationError.make({
        message: formatValidationErrorMessage(
          `Invalid request body for ${label}`,
          error,
        ),
        status: 400,
      })
    ),
  );
}

export function parseParams<A, I>(
  c: { req: { param: () => Record<string, string> } },
  schema: Schema.Schema<A, I>,
  label: string,
): Effect.Effect<A, RequestValidationError> {
  return decodeUnknownInput(
    c.req.param(),
    schema,
    `Invalid route params for ${label}`,
  );
}

export function parseQuery<A, I>(
  c: { req: { url: string } },
  schema: Schema.Schema<A, I>,
  label: string,
): Effect.Effect<A, RequestValidationError> {
  const searchParams = new URL(c.req.url).searchParams;
  return decodeUnknownInput(
    Object.fromEntries(searchParams.entries()),
    schema,
    `Invalid query parameters for ${label}`,
  );
}

export function toAddAnimeInput(
  body: Schema.Schema.Type<typeof AddAnimeInputSchema>,
): AddAnimeInput {
  return {
    ...body,
    release_profile_ids: [...body.release_profile_ids],
  };
}

export function toQualityProfile(
  body: Schema.Schema.Type<typeof QualityProfileSchema>,
): QualityProfile {
  return {
    ...body,
    allowed_qualities: [...body.allowed_qualities],
  };
}

export function toCreateReleaseProfileInput(
  body: Schema.Schema.Type<typeof CreateReleaseProfileSchema>,
) {
  return {
    ...body,
    rules: body.rules.map((rule) => ({ ...rule })),
  };
}

export function toUpdateReleaseProfileInput(
  body: Schema.Schema.Type<typeof UpdateReleaseProfileSchema>,
) {
  return {
    ...body,
    rules: body.rules.map((rule) => ({ ...rule })),
  };
}

export function toConfig(
  body: Schema.Schema.Type<typeof ConfigSchema>,
): Config {
  return {
    downloads: {
      ...body.downloads,
      preferred_groups: [...body.downloads.preferred_groups],
      remote_path_mappings: body.downloads.remote_path_mappings.map((
        mapping,
      ) => [
        ...mapping,
      ]),
    },
    general: { ...body.general },
    library: { ...body.library },
    nyaa: { ...body.nyaa },
    profiles: body.profiles.map(toQualityProfile),
    qbittorrent: { ...body.qbittorrent },
    scheduler: { ...body.scheduler },
    security: {
      ...body.security,
      auth_throttle: {
        ...body.security.auth_throttle,
        trusted_proxy_ips: [...body.security.auth_throttle.trusted_proxy_ips],
      },
    },
  };
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

function getOptionalViewer(
  c: { get: (key: string) => unknown },
): AuthUser | null {
  const viewer = c.get("viewer");

  if (!isAuthUser(viewer)) {
    return null;
  }

  return viewer;
}

function decodeUnknownInput<A, I>(
  input: unknown,
  schema: Schema.Schema<A, I>,
  message: string,
): Effect.Effect<A, RequestValidationError> {
  return Schema.decodeUnknown(schema)(input).pipe(
    Effect.mapError((error) =>
      RequestValidationError.make({
        message: formatValidationErrorMessage(message, error),
        status: 400,
      })
    ),
  );
}

function formatValidationErrorMessage(message: string, error: unknown) {
  if (ParseResult.isParseError(error)) {
    const issues = ParseResult.ArrayFormatter.formatErrorSync(error);

    if (issues.length > 0) {
      const details = issues.slice(0, 3).map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "input";
        return `${path}: ${issue.message}`;
      }).join("; ");

      return `${message}: ${details}`;
    }
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return `${message}: ${error.message}`;
  }

  return message;
}

function isAuthUser(value: unknown): value is AuthUser {
  return Boolean(
    value && typeof value === "object" && "id" in value && "username" in value,
  );
}
