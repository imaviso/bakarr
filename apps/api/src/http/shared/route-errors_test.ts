import { assert, it } from "@effect/vitest";
import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Logger } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { AuthForbiddenError, AuthUnauthorizedError } from "@/features/auth/errors.ts";
import { MediaConflictError, MediaNotFoundError, MediaPathError } from "@/features/media/errors.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInputError,
  OperationsPathError,
  OperationsStoredDataError,
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "@/features/operations/errors.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import {
  ConfigValidationError,
  ImageAssetAccessError,
  ImageAssetNotFoundError,
  ImageAssetTooLargeError,
  ProfileNotFoundError,
  StoredUnmappedFolderCorruptError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
} from "@/features/system/errors.ts";
import { mapRouteError } from "@/http/shared/route-errors/index.ts";
import {
  StreamAccessError,
  StreamRangeError,
} from "@/features/media/stream/media-stream-errors.ts";
import { RequestValidationError } from "@/http/shared/route-validation.ts";
import { routeResponse } from "@/http/shared/router-helpers.ts";

it("route errors maps known tagged errors to expected responses", () => {
  const cases = [
    {
      error: new RequestValidationError({
        message: "bad request",
        status: 400,
      }),
      expected: { message: "bad request", status: 400 },
    },
    {
      error: new ConfigValidationError({ message: "bad config" }),
      expected: { message: "bad config", status: 400 },
    },
    {
      error: new StoredConfigCorruptError({ cause: new Error("corrupt"), message: "corrupt" }),
      expected: { message: "Internal server error", status: 500 },
    },
    {
      error: new StoredConfigMissingError({ message: "missing" }),
      expected: { message: "Internal server error", status: 500 },
    },
    {
      error: new StreamAccessError({ message: "stream forbidden", status: 403 }),
      expected: { message: "stream forbidden", status: 403 },
    },
    {
      error: new MediaNotFoundError({ message: "media missing" }),
      expected: { message: "media missing", status: 404 },
    },
    {
      error: new ImageAssetAccessError({
        message: "Image asset bytes could not be read",
        status: 500,
      }),
      expected: { message: "Image asset bytes could not be read", status: 500 },
    },
    {
      error: new ImageAssetNotFoundError({ message: "Not Found", status: 404 }),
      expected: { message: "Not Found", status: 404 },
    },
    {
      error: new ImageAssetTooLargeError({
        message: "Image asset payload exceeded the allowed size",
        status: 413,
      }),
      expected: {
        message: "Image asset payload exceeded the allowed size",
        status: 413,
      },
    },
    {
      error: new DownloadNotFoundError({ message: "download missing" }),
      expected: { message: "download missing", status: 404 },
    },
    {
      error: new OperationsAnimeNotFoundError({ message: "ops media missing" }),
      expected: { message: "ops media missing", status: 404 },
    },
    {
      error: new ProfileNotFoundError({ message: "profile missing" }),
      expected: { message: "profile missing", status: 404 },
    },
    {
      error: new StoredUnmappedFolderCorruptError({
        message: "unmapped folder data is corrupt",
      }),
      expected: { message: "Internal server error", status: 500 },
    },
    {
      error: new OperationsInputError({ message: "bad input" }),
      expected: { message: "bad input", status: 400 },
    },
    {
      error: new MediaConflictError({ message: "media conflict" }),
      expected: { message: "media conflict", status: 409 },
    },
    {
      error: new DownloadConflictError({ message: "download conflict" }),
      expected: { message: "download conflict", status: 409 },
    },
    {
      error: new OperationsConflictError({ message: "ops conflict" }),
      expected: { message: "ops conflict", status: 409 },
    },
    {
      error: new MediaPathError({ message: "bad media path" }),
      expected: { message: "bad media path", status: 400 },
    },
    {
      error: new OperationsPathError({ message: "bad ops path" }),
      expected: { message: "bad ops path", status: 400 },
    },
    {
      error: new OperationsStoredDataError({ message: "stored ops data is corrupt" }),
      expected: { message: "stored ops data is corrupt", status: 500 },
    },
    {
      error: new RssFeedParseError({ message: "rss parse failed" }),
      expected: { message: "RSS feed response was invalid", status: 503 },
    },
    {
      error: new RssFeedRejectedError({ message: "rss rejected" }),
      expected: { message: "rss rejected", status: 400 },
    },
    {
      error: new RssFeedTooLargeError({ message: "rss too large" }),
      expected: {
        message: "RSS feed payload exceeded the allowed size",
        status: 503,
      },
    },
    {
      error: new ExternalCallError({
        cause: new Error("boom"),
        message: "external failed",
        operation: "rss.fetch",
      }),
      expected: { message: "External service unavailable", status: 503 },
    },
    {
      error: new DatabaseError({
        cause: new Error("db"),
        message: "db failed",
      }),
      expected: { message: "Internal server error", status: 500 },
    },
  ] as const;

  for (const testCase of cases) {
    assert.deepStrictEqual(mapRouteError(testCase.error), testCase.expected);
  }
});

it("route errors preserves range headers for stream", () => {
  assert.deepStrictEqual(
    mapRouteError(
      new StreamRangeError({
        fileSize: 1024,
        message: "Requested range not satisfiable",
        status: 416,
      }),
    ),
    {
      headers: { "Content-Range": "bytes */1024" },
      message: "Requested range not satisfiable",
      status: 416,
    },
  );
});

it("route errors falls back for unknown failures", () => {
  assert.deepStrictEqual(mapRouteError(new Error("boom")), {
    message: "Unexpected server error",
    status: 500,
  });
  assert.deepStrictEqual(mapRouteError("boom"), {
    message: "Unexpected server error",
    status: 500,
  });
});

it("auth route errors map auth failures locally", () => {
  assert.deepStrictEqual(mapRouteError(new AuthForbiddenError({ message: "forbidden" })), {
    message: "forbidden",
    status: 403,
  });
});

it.effect("route responses log mapped client errors below error level", () =>
  Effect.gen(function* () {
    const logs: Array<{ level: string; message: string }> = [];
    const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
      logs.push({ level: logLevel.label, message: String(message) });
    });
    const request = HttpServerRequest.fromWeb(new Request("http://localhost/api/auth/me"));

    const response = yield* routeResponse(
      Effect.fail(new AuthUnauthorizedError({ message: "Unauthorized" })),
      (value) => HttpServerResponse.json(value),
      mapRouteError,
    ).pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
    );

    assert.deepStrictEqual(HttpServerResponse.toWeb(response).status, 401);
    assert.deepStrictEqual(
      logs.some((log) => log.message.includes("HTTP route failed") && log.level === "ERROR"),
      false,
    );
  }),
);
