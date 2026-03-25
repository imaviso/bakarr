import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { FileSystem } from "../lib/filesystem.ts";

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
    ).pipe(Effect.catchAll(() => Effect.succeed(null)));

    if (staticResponse) {
      return staticResponse;
    }

    return yield* serveIndexHtmlEffect(request.method, webDistUrl).pipe(
      Effect.catchAll(() =>
        Effect.succeed(
          HttpServerResponse.text(
            "Frontend bundle not found. Run `bun run --cwd apps/web build` first.",
            {
              headers: { "Content-Type": "text/plain; charset=utf-8" },
              status: 503,
            },
          ),
        )
      ),
    );
  });
}

const serveStaticAssetEffect = Effect.fn("Static.serveStaticAssetEffect")(
  function* (method: string, pathname: string, webDistUrl: URL) {
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
      contentType: contentTypeForPath(normalized),
      fileUrl,
      method,
    });
  },
);

const serveIndexHtmlEffect = Effect.fn("Static.serveIndexHtmlEffect")(
  function* (method: string, webDistUrl: URL) {
    return yield* createFileResponse({
      cacheControl: "no-cache",
      contentType: "text/html; charset=utf-8",
      fileUrl: new URL("index.html", webDistUrl),
      method,
    });
  },
);

const createFileResponse = Effect.fn("Static.createFileResponse")(
  function* (input: {
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
  },
);
function contentTypeForPath(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".woff2")) return "font/woff2";
  if (path.endsWith(".woff")) return "font/woff";
  if (path.endsWith(".ttf")) return "font/ttf";
  if (path.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (path.endsWith(".map")) return "application/json; charset=utf-8";

  return "application/octet-stream";
}
