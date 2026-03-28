import { assertEquals, it } from "../test/vitest.ts";

import { DatabaseError } from "../db/database.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
} from "../features/anime/errors.ts";
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
} from "../features/operations/errors.ts";
import { ExternalCallError } from "../lib/effect-retry.ts";
import {
  ConfigValidationError,
  ImageAssetNotFoundError,
  ImageAssetTooLargeError,
  ProfileNotFoundError,
  StoredUnmappedFolderCorruptError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
} from "../features/system/errors.ts";
import { mapRouteError } from "./route-errors.ts";
import { mapAuthRouteError } from "./route-auth.ts";
import { EpisodeStreamAccessError, EpisodeStreamRangeError } from "./streaming-errors.ts";
import { RequestValidationError } from "./route-validation.ts";

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
      error: new StoredConfigCorruptError({ message: "corrupt" }),
      expected: { message: "corrupt", status: 500 },
    },
    {
      error: new StoredConfigMissingError({ message: "missing" }),
      expected: { message: "missing", status: 500 },
    },
    {
      error: new EpisodeStreamAccessError({ message: "stream forbidden", status: 403 }),
      expected: { message: "stream forbidden", status: 403 },
    },
    {
      error: new AnimeNotFoundError({ message: "anime missing" }),
      expected: { message: "anime missing", status: 404 },
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
      error: new OperationsAnimeNotFoundError({ message: "ops anime missing" }),
      expected: { message: "ops anime missing", status: 404 },
    },
    {
      error: new ProfileNotFoundError({ message: "profile missing" }),
      expected: { message: "profile missing", status: 404 },
    },
    {
      error: new StoredUnmappedFolderCorruptError({
        message: "unmapped folder data is corrupt",
      }),
      expected: { message: "unmapped folder data is corrupt", status: 500 },
    },
    {
      error: new OperationsInputError({ message: "bad input" }),
      expected: { message: "bad input", status: 400 },
    },
    {
      error: new AnimeConflictError({ message: "anime conflict" }),
      expected: { message: "anime conflict", status: 409 },
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
      error: new AnimePathError({ message: "bad anime path" }),
      expected: { message: "bad anime path", status: 400 },
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
      expected: { message: "db failed", status: 500 },
    },
  ] as const;

  for (const testCase of cases) {
    assertEquals(mapRouteError(testCase.error), testCase.expected);
  }
});

it("route errors preserves range headers for episode streaming", () => {
  assertEquals(
    mapRouteError(
      new EpisodeStreamRangeError({
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
  assertEquals(mapRouteError(new Error("boom")), {
    message: "Unexpected server error",
    status: 500,
  });
  assertEquals(mapRouteError("boom"), {
    message: "Unexpected server error",
    status: 500,
  });
});

it("auth route errors map auth failures locally", () => {
  assertEquals(
    mapAuthRouteError({ _tag: "AuthError", message: "forbidden", status: 403 }),
    { message: "forbidden", status: 403 },
  );
});
