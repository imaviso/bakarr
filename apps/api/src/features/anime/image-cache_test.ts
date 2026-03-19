import { assertEquals } from "@std/assert";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "@effect/platform";
import { Effect } from "effect";

import type { FileSystemShape } from "../../lib/filesystem.ts";
import { FileSystemError } from "../../lib/filesystem.ts";
import { runTestEffect } from "../../test/effect-test.ts";
import { cacheAnimeMetadataImages } from "./image-cache.ts";

Deno.test("cacheAnimeMetadataImages uses provided HttpClient for remote images", async () => {
  const dir = await Deno.makeTempDir();
  const originalFetch = globalThis.fetch;

  try {
    const fs = makeTestFileSystem();
    const imageBytes = Uint8Array.from([137, 80, 78, 71]);
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(imageBytes, {
            headers: { "content-type": "image/png" },
            status: 200,
          }),
        ),
      )
    );

    globalThis.fetch = () =>
      Promise.reject(new Error("unexpected global fetch"));

    const result = await runTestEffect(
      cacheAnimeMetadataImages(fs, client, dir, 55, {
        coverImage: "https://example.com/cover",
      }),
    );

    assertEquals(result.coverImage, "/api/images/anime/55/cover.png");
    assertEquals(await exists(`${dir}/anime/55/cover.png`), true);
  } finally {
    globalThis.fetch = originalFetch;
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("cacheAnimeMetadataImages saves cover and banner files locally", async () => {
  const dir = await Deno.makeTempDir();

  try {
    const fs = makeTestFileSystem();

    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const result = await Effect.runPromise(
      cacheAnimeMetadataImages(fs, clientFromFetch(), dir, 99, {
        bannerImage: dataUrl,
        coverImage: dataUrl,
      }) as Effect.Effect<
        { bannerImage?: string; coverImage?: string },
        FileSystemError,
        never
      >,
    );

    assertEquals(result.coverImage, "/api/images/anime/99/cover.png");
    assertEquals(result.bannerImage, "/api/images/anime/99/banner.png");
    assertEquals(
      (await Deno.stat(`${dir}/anime/99/cover.png`)).isFile,
      true,
    );
    assertEquals(
      (await Deno.stat(`${dir}/anime/99/banner.png`)).isFile,
      true,
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("cacheAnimeMetadataImages falls back to original URLs on unsupported image types", async () => {
  const dir = await Deno.makeTempDir();
  const originalFetch = globalThis.fetch;

  try {
    const fs = makeTestFileSystem();

    globalThis.fetch = () =>
      Promise.resolve(
        new Response("not-an-image", {
          headers: { "content-type": "text/plain" },
          status: 200,
        }),
      );

    const coverUrl = "https://example.com/cover";
    const bannerUrl = "https://example.com/banner";
    const result = await Effect.runPromise(
      cacheAnimeMetadataImages(fs, clientFromFetch(), dir, 77, {
        bannerImage: bannerUrl,
        coverImage: coverUrl,
      }) as Effect.Effect<
        { bannerImage?: string; coverImage?: string },
        FileSystemError,
        never
      >,
    );

    assertEquals(result.coverImage, coverUrl);
    assertEquals(result.bannerImage, bannerUrl);
    assertEquals(
      await exists(`${dir}/anime/77/cover.png`),
      false,
    );
    assertEquals(
      await exists(`${dir}/anime/77/banner.png`),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("cacheAnimeMetadataImages rejects oversized images by Content-Length", async () => {
  const dir = await Deno.makeTempDir();
  const originalFetch = globalThis.fetch;

  try {
    const fs = makeTestFileSystem();

    globalThis.fetch = () =>
      Promise.resolve(
        new Response("x".repeat(100), {
          headers: {
            "content-type": "image/png",
            "content-length": "15000000",
          },
          status: 200,
        }),
      );

    const coverUrl = "https://example.com/huge.png";
    const result = await Effect.runPromise(
      cacheAnimeMetadataImages(fs, clientFromFetch(), dir, 77, {
        coverImage: coverUrl,
      }) as Effect.Effect<
        { bannerImage?: string; coverImage?: string },
        FileSystemError,
        never
      >,
    );

    assertEquals(result.coverImage, coverUrl);
    assertEquals(
      await exists(`${dir}/anime/77/cover.png`),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("cacheAnimeMetadataImages rejects oversized images by streamed bytes", async () => {
  const dir = await Deno.makeTempDir();
  const originalFetch = globalThis.fetch;

  try {
    const fs = makeTestFileSystem();

    const largeBody = new Uint8Array(11 * 1024 * 1024);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(largeBody);
        controller.close();
      },
    });

    globalThis.fetch = () =>
      Promise.resolve(
        new Response(stream, {
          headers: { "content-type": "image/png" },
          status: 200,
        }),
      );

    const coverUrl = "https://example.com/huge-stream.png";
    const result = await Effect.runPromise(
      cacheAnimeMetadataImages(fs, clientFromFetch(), dir, 77, {
        coverImage: coverUrl,
      }) as Effect.Effect<
        { bannerImage?: string; coverImage?: string },
        FileSystemError,
        never
      >,
    );

    assertEquals(result.coverImage, coverUrl);
    assertEquals(
      await exists(`${dir}/anime/77/cover.png`),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await Deno.remove(dir, { recursive: true });
  }
});

async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

function makeTestFileSystem(): FileSystemShape {
  return {
    copyFile: (from, to) =>
      Effect.tryPromise({
        try: () => Deno.copyFile(from, to),
        catch: (cause) =>
          new FileSystemError({ cause, message: "copy", path: from }),
      }),
    openFile: (path, options) =>
      Effect.acquireRelease(
        Effect.tryPromise({
          try: () => Deno.open(path, options),
          catch: (cause) =>
            new FileSystemError({
              cause,
              message: "openFile",
              path: toPathString(path),
            }),
        }),
        (file) => Effect.sync(() => file.close()),
      ),
    mkdir: (path, options) =>
      Effect.tryPromise({
        try: () => Deno.mkdir(path, options),
        catch: (cause) =>
          new FileSystemError({
            cause,
            message: "mkdir",
            path: toPathString(path),
          }),
      }),
    readDir: (path) =>
      Effect.tryPromise({
        try: () => Array.fromAsync(Deno.readDir(path)),
        catch: (cause) =>
          new FileSystemError({
            cause,
            message: "readDir",
            path: toPathString(path),
          }),
      }),
    readFile: (path) =>
      Effect.tryPromise({
        try: () => Deno.readFile(path),
        catch: (cause) =>
          new FileSystemError({
            cause,
            message: "readFile",
            path: toPathString(path),
          }),
      }),
    realPath: (path) =>
      Effect.tryPromise({
        try: () => Deno.realPath(path),
        catch: (cause) =>
          new FileSystemError({
            cause,
            message: "realPath",
            path: toPathString(path),
          }),
      }),
    remove: (path, options) =>
      Effect.tryPromise({
        try: () => Deno.remove(path, options),
        catch: (cause) =>
          new FileSystemError({
            cause,
            message: "remove",
            path: toPathString(path),
          }),
      }),
    rename: (from, to) =>
      Effect.tryPromise({
        try: () => Deno.rename(from, to),
        catch: (cause) =>
          new FileSystemError({ cause, message: "rename", path: from }),
      }),
    stat: (path) =>
      Effect.tryPromise({
        try: () => Deno.stat(path),
        catch: (cause) =>
          new FileSystemError({
            cause,
            message: "stat",
            path: toPathString(path),
          }),
      }),
    writeFile: (path, data) =>
      Effect.tryPromise({
        try: () => Deno.writeFile(path, data),
        catch: (cause) =>
          new FileSystemError({
            cause,
            message: "writeFile",
            path: toPathString(path),
          }),
      }),
  };
}

function toPathString(path: string | URL) {
  return typeof path === "string" ? path : path.toString();
}

function clientFromFetch() {
  return Effect.runSync(
    HttpClient.HttpClient.pipe(Effect.provide(FetchHttpClient.layer)),
  );
}
