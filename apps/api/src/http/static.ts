import { Effect } from "effect";

import { FileSystem } from "../lib/filesystem.ts";
import type { RunEffect } from "./route-types.ts";

const DEFAULT_WEB_DIST_URL = new URL("../../../web/dist/", import.meta.url);

export function createAppFetchHandler(
  appFetch: (request: Request) => Response | Promise<Response>,
  runEffect: RunEffect,
  webDistUrl = DEFAULT_WEB_DIST_URL,
) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api") || url.pathname === "/health") {
      return appFetch(request);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const staticResponse = await serveStaticAsset(
      runEffect,
      url.pathname,
      webDistUrl,
    );

    if (staticResponse) {
      return staticResponse;
    }

    return await serveIndexHtml(runEffect, webDistUrl);
  };
}

async function serveStaticAsset(
  runEffect: RunEffect,
  pathname: string,
  webDistUrl: URL,
): Promise<Response | null> {
  const normalized = pathname === "/" ? "index.html" : pathname.slice(1);

  if (normalized.length === 0) {
    return null;
  }

  const fileUrl = new URL(normalized, webDistUrl);

  if (!fileUrl.pathname.startsWith(webDistUrl.pathname)) {
    return null;
  }

  try {
    const file = await runEffect(
      Effect.flatMap(FileSystem, (fs) => fs.readFile(fileUrl)),
    );

    return new Response(new Uint8Array(file), {
      headers: {
        "Cache-Control": normalized.startsWith("assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300",
        "Content-Type": contentTypeForPath(normalized),
      },
    });
  } catch {
    return null;
  }
}

async function serveIndexHtml(
  runEffect: RunEffect,
  webDistUrl: URL,
): Promise<Response> {
  try {
    const file = await runEffect(
      Effect.flatMap(
        FileSystem,
        (fs) => fs.readFile(new URL("index.html", webDistUrl)),
      ),
    );

    return new Response(new Uint8Array(file), {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch {
    return new Response(
      "Frontend bundle not found. Run `deno task --cwd=apps/web build` first.",
      {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }
}

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
