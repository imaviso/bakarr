import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { FileSystem, FileSystemError } from "../lib/filesystem.ts";
import { assertEquals, assertMatch, it } from "../test/vitest.ts";
import { makeNoopTestFileSystemWithOverridesEffect } from "../test/filesystem-test.ts";
import { createStaticHttpApp } from "./static.ts";

const WEB_DIST_URL = new URL("file:///virtual/web/dist/");

it.effect("static app falls back to index.html for app routes", () =>
  Effect.gen(function* () {
    const response = yield* runStaticRequest({
      fs: yield* makeStaticFileSystemEffect({
        files: {
          "index.html": "<html><body>app shell</body></html>",
        },
      }),
      url: "http://bakarr.local/library",
    });

    assertEquals(response.status, 200);
    assertMatch(yield* Effect.promise(() => response.text()), /app shell/);
  }),
);

it.effect("static app returns 404 for missing asset paths instead of serving index.html", () =>
  Effect.gen(function* () {
    const response = yield* runStaticRequest({
      fs: yield* makeStaticFileSystemEffect({
        files: {
          "index.html": "<html><body>app shell</body></html>",
        },
      }),
      url: "http://bakarr.local/assets/app.js",
    });

    assertEquals(response.status, 404);
    assertMatch(yield* Effect.promise(() => response.text()), /not found/i);
  }),
);

it.effect(
  "static app returns 503 for asset IO failures instead of falling back to index.html",
  () =>
    Effect.gen(function* () {
      const response = yield* runStaticRequest({
        fs: yield* makeStaticFileSystemEffect({
          files: {
            "index.html": "<html><body>app shell</body></html>",
          },
          readFailures: {
            "assets/app.js": makeFsError("assets/app.js", new Error("EIO")),
          },
          statSizes: {
            "assets/app.js": 128,
          },
        }),
        url: "http://bakarr.local/assets/app.js",
      });

      assertEquals(response.status, 503);
      assertMatch(yield* Effect.promise(() => response.text()), /bundle unavailable/i);
    }),
);

function runStaticRequest(input: { readonly fs: typeof FileSystem.Service; readonly url: string }) {
  return createStaticHttpApp(WEB_DIST_URL).pipe(
    Effect.provideService(
      HttpServerRequest.HttpServerRequest,
      HttpServerRequest.fromWeb(new Request(input.url)),
    ),
    Effect.provideService(FileSystem, input.fs),
    Effect.map((response) => HttpServerResponse.toWeb(response)),
  );
}

function makeStaticFileSystemEffect(input: {
  readonly files: Record<string, string>;
  readonly readFailures?: Record<string, FileSystemError>;
  readonly statFailures?: Record<string, FileSystemError>;
  readonly statSizes?: Record<string, number>;
}) {
  const encoder = new TextEncoder();

  return makeNoopTestFileSystemWithOverridesEffect({
    readFile: (path) => {
      const key = toRelativePath(path);
      const failure = input.readFailures?.[key];
      if (failure) {
        return Effect.fail(failure);
      }

      const file = input.files[key];
      if (file !== undefined) {
        return Effect.succeed(encoder.encode(file));
      }

      return Effect.fail(makeNotFoundError(key));
    },
    stat: (path) => {
      const key = toRelativePath(path);
      const failure = input.statFailures?.[key];
      if (failure) {
        return Effect.fail(failure);
      }

      const file = input.files[key];
      if (file !== undefined || input.statSizes?.[key] !== undefined) {
        return Effect.succeed({
          isDirectory: false,
          isFile: true,
          isSymlink: false,
          size: input.statSizes?.[key] ?? file?.length ?? 0,
        });
      }

      return Effect.fail(makeNotFoundError(key));
    },
  });
}

function makeFsError(path: string, cause: Error) {
  return new FileSystemError({ cause, message: "filesystem failure", path });
}

function makeNotFoundError(path: string) {
  const cause = new Error("Not found") as Error & { code?: string };
  cause.code = "ENOENT";
  return makeFsError(path, cause);
}

function toRelativePath(path: string | URL) {
  const url = typeof path === "string" ? new URL(path) : path;
  return url.pathname.replace(WEB_DIST_URL.pathname, "");
}
