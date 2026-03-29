import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { animeRouter } from "./anime-router.ts";
import { authRouter } from "./auth-router.ts";
import { downloadsRouter } from "./operations-downloads-router.ts";
import { libraryRouter } from "./operations-library-router.ts";
import { rssRouter } from "./operations-rss-router.ts";
import { searchRouter } from "./operations-search-router.ts";
import { isNotFoundError } from "../lib/fs-errors.ts";
import { FileSystem } from "../lib/filesystem.ts";
import { contentType } from "./route-fs.ts";
import { systemRouter } from "./system-router.ts";

const DEFAULT_WEB_DIST_URL = new URL("../../../web/dist/", import.meta.url);

export function createHttpApp(options: { readonly staticWebDistUrl?: URL } = {}) {
  const webDistUrl = options.staticWebDistUrl ?? DEFAULT_WEB_DIST_URL;

  return HttpRouter.empty.pipe(
    HttpRouter.concat(HttpRouter.prefixAll(authRouter, "/api/auth")),
    HttpRouter.concat(HttpRouter.prefixAll(animeRouter, "/api")),
    HttpRouter.concat(
      HttpRouter.prefixAll(
        HttpRouter.concatAll(downloadsRouter, rssRouter, libraryRouter, searchRouter),
        "/api",
      ),
    ),
    HttpRouter.concat(systemRouter),
    HttpRouter.get(
      "*",
      Effect.gen(function* () {
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
        }).pipe(
          Effect.catchTag("FileSystemError", () => Effect.succeed(bundleUnavailableResponse())),
        );
      }),
    ),
    HttpRouter.toHttpApp,
  );
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
