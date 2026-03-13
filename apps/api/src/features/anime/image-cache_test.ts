import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import type { FileSystemShape } from "../../lib/filesystem.ts";
import { FileSystemError } from "../../lib/filesystem.ts";
import { cacheAnimeMetadataImages } from "./image-cache.ts";

Deno.test("cacheAnimeMetadataImages saves cover and banner files locally", async () => {
  const dir = await Deno.makeTempDir();

  try {
    const fs: FileSystemShape = {
      copyFile: (from, to) =>
        Effect.tryPromise({
          try: () => Deno.copyFile(from, to),
          catch: (cause) =>
            new FileSystemError({ cause, message: "copy", path: from }),
        }),
      mkdir: (path, options) =>
        Effect.tryPromise({
          try: () => Deno.mkdir(path, options),
          catch: (cause) =>
            new FileSystemError({ cause, message: "mkdir", path }),
        }),
      readDir: (path) =>
        Effect.tryPromise({
          try: () => Array.fromAsync(Deno.readDir(path)),
          catch: (cause) =>
            new FileSystemError({ cause, message: "readDir", path }),
        }),
      readFile: (path) =>
        Effect.tryPromise({
          try: () => Deno.readFile(path),
          catch: (cause) =>
            new FileSystemError({ cause, message: "readFile", path }),
        }),
      realPath: (path) =>
        Effect.tryPromise({
          try: () => Deno.realPath(path),
          catch: (cause) =>
            new FileSystemError({ cause, message: "realPath", path }),
        }),
      remove: (path, options) =>
        Effect.tryPromise({
          try: () => Deno.remove(path, options),
          catch: (cause) =>
            new FileSystemError({ cause, message: "remove", path }),
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
            new FileSystemError({ cause, message: "stat", path }),
        }),
      writeFile: (path, data) =>
        Effect.tryPromise({
          try: () => Deno.writeFile(path, data),
          catch: (cause) =>
            new FileSystemError({ cause, message: "writeFile", path }),
        }),
    };

    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const result = await Effect.runPromise(
      cacheAnimeMetadataImages(fs, dir, 99, {
        bannerImage: dataUrl,
        coverImage: dataUrl,
      }),
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
    const fs: FileSystemShape = {
      copyFile: (from, to) =>
        Effect.tryPromise({
          try: () => Deno.copyFile(from, to),
          catch: (cause) =>
            new FileSystemError({ cause, message: "copy", path: from }),
        }),
      mkdir: (path, options) =>
        Effect.tryPromise({
          try: () => Deno.mkdir(path, options),
          catch: (cause) =>
            new FileSystemError({ cause, message: "mkdir", path }),
        }),
      readDir: (path) =>
        Effect.tryPromise({
          try: () => Array.fromAsync(Deno.readDir(path)),
          catch: (cause) =>
            new FileSystemError({ cause, message: "readDir", path }),
        }),
      readFile: (path) =>
        Effect.tryPromise({
          try: () => Deno.readFile(path),
          catch: (cause) =>
            new FileSystemError({ cause, message: "readFile", path }),
        }),
      realPath: (path) =>
        Effect.tryPromise({
          try: () => Deno.realPath(path),
          catch: (cause) =>
            new FileSystemError({ cause, message: "realPath", path }),
        }),
      remove: (path, options) =>
        Effect.tryPromise({
          try: () => Deno.remove(path, options),
          catch: (cause) =>
            new FileSystemError({ cause, message: "remove", path }),
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
            new FileSystemError({ cause, message: "stat", path }),
        }),
      writeFile: (path, data) =>
        Effect.tryPromise({
          try: () => Deno.writeFile(path, data),
          catch: (cause) =>
            new FileSystemError({ cause, message: "writeFile", path }),
        }),
    };

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
      cacheAnimeMetadataImages(fs, dir, 77, {
        bannerImage: bannerUrl,
        coverImage: coverUrl,
      }),
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

async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
