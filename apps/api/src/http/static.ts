import { Chunk, Effect, Option, Stream } from "effect";

import { FileSystem, FileSystemError } from "../lib/filesystem.ts";
import type { RunEffect } from "./route-types.ts";

const DEFAULT_WEB_DIST_URL = new URL("../../../web/dist/", import.meta.url);
const STATIC_STREAM_CHUNK_SIZE = 64 * 1024;

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
      request.method,
      url.pathname,
      webDistUrl,
    );

    if (staticResponse) {
      return staticResponse;
    }

    return await serveIndexHtml(runEffect, request.method, webDistUrl);
  };
}

async function serveStaticAsset(
  runEffect: RunEffect,
  method: string,
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
    return await runEffect(
      createFileResponse({
        cacheControl: normalized.startsWith("assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300",
        contentType: contentTypeForPath(normalized),
        fileUrl,
        method,
      }),
    );
  } catch {
    return null;
  }
}

async function serveIndexHtml(
  runEffect: RunEffect,
  method: string,
  webDistUrl: URL,
): Promise<Response> {
  try {
    return await runEffect(
      createFileResponse({
        cacheControl: "no-cache",
        contentType: "text/html; charset=utf-8",
        fileUrl: new URL("index.html", webDistUrl),
        method,
      }),
    );
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
      return new Response(null, { headers });
    }

    const body = createFileReadableStream(fs, input.fileUrl);
    return new Response(body, { headers });
  },
);

function createFileReadableStream(
  fs: typeof FileSystem.Service,
  path: URL,
): ReadableStream<Uint8Array> {
  return Stream.toReadableStream<Uint8Array>({})(
    createFileChunkStream(fs, path),
  );
}

function createFileChunkStream(
  fs: typeof FileSystem.Service,
  path: URL,
): Stream.Stream<Uint8Array, FileSystemError> {
  return Stream.unwrapScoped(
    Effect.map(
      fs.openFile(path, { read: true }),
      (file) =>
        Stream.paginateChunkEffect(
          0,
          (offset) =>
            Effect.tryPromise({
              try: async () => {
                const buffer = new Uint8Array(STATIC_STREAM_CHUNK_SIZE);

                await file.seek(offset, Deno.SeekMode.Start);
                const read = await file.read(buffer);

                if (read === null || read === 0) {
                  return [
                    Chunk.empty<Uint8Array>(),
                    Option.none<number>(),
                  ] as const;
                }

                return [
                  Chunk.of(buffer.subarray(0, read)),
                  Option.some(offset + read),
                ] as const;
              },
              catch: (cause) =>
                new FileSystemError({
                  cause,
                  message: "Failed to read static file",
                  path: path.toString(),
                }),
            }),
        ),
    ),
  );
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
