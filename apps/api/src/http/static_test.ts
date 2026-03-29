import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { isNotFoundError } from "@/lib/fs-errors.ts";
import { FileSystem, FileSystemError } from "@/lib/filesystem.ts";
import { assertEquals, assertMatch, it } from "@/test/vitest.ts";
import { makeNoopTestFileSystemWithOverridesEffect } from "@/test/filesystem-test.ts";
import { contentType } from "@/http/route-fs.ts";

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
  return Effect.gen(function* () {
    return yield* createStaticHttpAppForTest(WEB_DIST_URL).pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request(input.url)),
      ),
      Effect.provideService(FileSystem, input.fs),
      Effect.map((response) => HttpServerResponse.toWeb(response)),
    );
  });
}

function createStaticHttpAppForTest(webDistUrl = WEB_DIST_URL) {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, "http://bakarr.local");

    if (request.method !== "GET" && request.method !== "HEAD") {
      return HttpServerResponse.text("Method Not Allowed", { status: 405 });
    }

    const staticResponse = yield* Effect.gen(function* () {
      const normalized = url.pathname === "/" ? "index.html" : url.pathname.slice(1);

      if (normalized.length === 0) {
        return null;
      }

      const fileUrl = new URL(normalized, webDistUrl);

      if (!fileUrl.pathname.startsWith(webDistUrl.pathname)) {
        return null;
      }

      return yield* createFileResponse({
        cacheControl: normalized.startsWith("assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300",
        contentType: contentType(normalized),
        fileUrl,
        method: request.method,
      });
    }).pipe(
      Effect.catchTag("FileSystemError", (error) => {
        if (isNotFoundError(error)) {
          const normalized = url.pathname === "/" ? "" : url.pathname.slice(1);
          return Effect.succeed(
            normalized.startsWith("assets/") || /\.[A-Za-z0-9]+$/.test(normalized)
              ? HttpServerResponse.text("Static asset not found", {
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                  status: 404,
                })
              : null,
          );
        }

        return Effect.succeed(bundleUnavailableResponse());
      }),
    );

    if (staticResponse) {
      return staticResponse;
    }

    return yield* createFileResponse({
      cacheControl: "no-cache",
      contentType: "text/html; charset=utf-8",
      fileUrl: new URL("index.html", webDistUrl),
      method: request.method,
    }).pipe(Effect.catchTag("FileSystemError", () => Effect.succeed(bundleUnavailableResponse())));
  });
}

const createFileResponse = Effect.fn("Static.createFileResponse")(function* (input: {
  cacheControl: string;
  contentType: string;
  fileUrl: URL;
  method: string;
}) {
  const fs = yield* FileSystem;
  const stat = yield* fs.stat(input.fileUrl);

  const headers = {
    "Cache-Control": input.cacheControl,
    "Content-Length": String(stat.size),
    "Content-Type": input.contentType,
  };

  if (input.method === "HEAD") {
    return HttpServerResponse.empty({ headers });
  }

  const body = yield* fs.readFile(input.fileUrl);

  return HttpServerResponse.uint8Array(body, { headers });
});

function bundleUnavailableResponse() {
  return HttpServerResponse.text(
    "Frontend bundle unavailable. Run `bun run --cwd apps/web build` first.",
    {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      status: 503,
    },
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
