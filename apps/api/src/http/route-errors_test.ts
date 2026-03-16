import { assertEquals } from "@std/assert";

import { DatabaseError } from "../db/database.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
} from "../features/anime/errors.ts";
import { AuthError } from "../features/auth/service.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  ExternalCallError,
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInputError,
  OperationsPathError,
} from "../features/operations/errors.ts";
import {
  ConfigValidationError,
  ProfileNotFoundError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
} from "../features/system/errors.ts";
import { mapRouteError } from "./route-errors.ts";
import { EpisodeStreamRangeError } from "./streaming-errors.ts";
import { RequestValidationError } from "./route-validation.ts";

Deno.test("route errors maps known tagged errors to expected responses", () => {
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
      error: new AuthError({ message: "forbidden", status: 403 }),
      expected: { message: "forbidden", status: 403 },
    },
    {
      error: new AnimeNotFoundError({ message: "anime missing" }),
      expected: { message: "anime missing", status: 404 },
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

Deno.test("route errors preserves range headers for episode streaming", () => {
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

Deno.test("route errors falls back for unknown failures", () => {
  assertEquals(mapRouteError(new Error("boom")), {
    message: "boom",
    status: 500,
  });
  assertEquals(mapRouteError("boom"), {
    message: "Unexpected server error",
    status: 500,
  });
});
