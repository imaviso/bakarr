import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { isNotFoundError } from "../lib/fs-errors.ts";
import { FileSystem } from "../lib/filesystem.ts";
import { contentType } from "./route-fs.ts";

const DEFAULT_WEB_DIST_URL = new URL("../../../web/dist/", import.meta.url);
export function createStaticHttpApp(webDistUrl = DEFAULT_WEB_DIST_URL) {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, "http://bakarr.local");

    if (request.method !== "GET" && request.method !== "HEAD") {
      return HttpServerResponse.text("Method Not Allowed", { status: 405 });
    }

    const staticResponse = yield* serveStaticAssetEffect(
      request.method,
      url.pathname,
      webDistUrl,
    ).pipe(
      Effect.catchTag("FileSystemError", (error) => {
        if (isNotFoundError(error)) {
          return Effect.succeed(
            isAssetPath(url.pathname) ? notFoundResponse("Static asset not found") : null,
          );
        }

        return Effect.succeed(bundleUnavailableResponse());
      }),
    );

    if (staticResponse) {
      return staticResponse;
    }

    return yield* serveIndexHtmlEffect(request.method, webDistUrl).pipe(
      Effect.catchTag("FileSystemError", () => Effect.succeed(bundleUnavailableResponse())),
    );
  });
}

const serveStaticAssetEffect = Effect.fn("Static.serveStaticAssetEffect")(function* (
  method: string,
  pathname: string,
  webDistUrl: URL,
) {
  const normalized = pathname === "/" ? "index.html" : pathname.slice(1);

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
    method,
  });
});

const serveIndexHtmlEffect = Effect.fn("Static.serveIndexHtmlEffect")(function* (
  method: string,
  webDistUrl: URL,
) {
  return yield* createFileResponse({
    cacheControl: "no-cache",
    contentType: "text/html; charset=utf-8",
    fileUrl: new URL("index.html", webDistUrl),
    method,
  });
});

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

function isAssetPath(pathname: string) {
  const normalized = pathname === "/" ? "" : pathname.slice(1);
  return normalized.startsWith("assets/") || /\.[A-Za-z0-9]+$/.test(normalized);
}

function bundleUnavailableResponse() {
  return HttpServerResponse.text(
    "Frontend bundle unavailable. Run `bun run --cwd apps/web build` first.",
    {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      status: 503,
    },
  );
}

function notFoundResponse(message: string) {
  return HttpServerResponse.text(message, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: 404,
  });
}
