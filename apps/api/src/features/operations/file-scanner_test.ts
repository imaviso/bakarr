import { assertEquals } from "@std/assert";

import { Effect, Stream } from "effect";

import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { runTestEffect, runTestEffectExit } from "../../test/effect-test.ts";
import { scanVideoFiles, scanVideoFilesStream } from "./file-scanner.ts";

const tree = new Map<string, Deno.DirEntry[]>([
  [
    "/library",
    [
      entry("show", { isDirectory: true }),
      entry("notes.txt", { isFile: true }),
    ],
  ],
  [
    "/library/show",
    [
      entry("episode-01.mkv", { isFile: true }),
      entry("season-2", { isDirectory: true }),
    ],
  ],
  [
    "/library/show/season-2",
    [
      entry("episode-02.mp4", { isFile: true }),
      entry("broken", { isDirectory: true }),
    ],
  ],
]);

const mockFs: FileSystemShape = {
  openFile: () => Effect.die("unused"),
  readFile: () => Effect.die("unused"),
  readDir: (path) =>
    toPathString(path) === "/library/show/season-2/broken"
      ? Effect.fail(
        new FileSystemError({
          cause: new Error("denied"),
          message: "Failed to read directory",
          path: toPathString(path),
        }),
      )
      : Effect.succeed(tree.get(toPathString(path)) ?? []),
  readDirStream: (path) =>
    toPathString(path) === "/library/show/season-2/broken"
      ? Stream.fail(
        new FileSystemError({
          cause: new Error("denied"),
          message: "Failed to read directory",
          path: toPathString(path),
        }),
      )
      : Stream.fromIterable(tree.get(toPathString(path)) ?? []).pipe(
        Stream.map((entry) => entry),
      ),
  realPath: (path) => Effect.succeed(toPathString(path)),
  stat: (path) =>
    Effect.succeed({
      size: toPathString(path).endsWith("episode-01.mkv") ? 100 : 200,
    } as Deno.FileInfo),
  mkdir: () => Effect.die("unused"),
  rename: () => Effect.die("unused"),
  copyFile: () => Effect.die("unused"),
  writeFile: () => Effect.die("unused"),
  remove: () => Effect.die("unused"),
};

Deno.test("scanVideoFilesStream streams matching files and skips bad dirs", async () => {
  const files = await runTestEffect(
    Stream.runCollect(scanVideoFilesStream(mockFs, "/library")).pipe(
      Effect.map((items) => Array.from(items, (file) => file.path)),
    ),
  );

  assertEquals(files, [
    "/library/show/episode-01.mkv",
    "/library/show/season-2/episode-02.mp4",
  ]);
});

Deno.test("scanVideoFiles collects iterator output", async () => {
  const files = await Effect.runPromise(scanVideoFiles(mockFs, "/library"));

  assertEquals(
    files,
    [
      {
        name: "episode-01.mkv",
        path: "/library/show/episode-01.mkv",
        size: 100,
      },
      {
        name: "episode-02.mp4",
        path: "/library/show/season-2/episode-02.mp4",
        size: 200,
      },
    ],
  );
});

Deno.test("scanVideoFiles fails when the root path is inaccessible", async () => {
  const exit = await runTestEffectExit(
    scanVideoFiles(mockFs, "/library/show/season-2/broken"),
  );

  assertEquals(exit._tag, "Failure");
});

Deno.test("scanVideoFilesStream uses streaming dir reader when available", async () => {
  let streamed = 0;
  const readDirError = new FileSystemError({
    cause: new Error("readDir should not be used"),
    message: "readDir should not be used",
    path: "/library",
  });
  const streamingFs: FileSystemShape = {
    ...mockFs,
    readDir: () => Effect.fail(readDirError),
    readDirStream: (path) => {
      streamed += 1;
      return Stream.fromIterable(tree.get(toPathString(path)) ?? []);
    },
  };

  const files = await runTestEffect(
    Stream.runCollect(scanVideoFilesStream(streamingFs, "/library")).pipe(
      Effect.map((items) => Array.from(items, (file) => file.path)),
    ),
  );

  assertEquals(files, [
    "/library/show/episode-01.mkv",
    "/library/show/season-2/episode-02.mp4",
  ]);
  assertEquals(streamed > 0, true);
});

function entry(
  name: string,
  options: { isDirectory?: boolean; isFile?: boolean; isSymlink?: boolean },
): Deno.DirEntry {
  return {
    isDirectory: options.isDirectory ?? false,
    isFile: options.isFile ?? false,
    isSymlink: options.isSymlink ?? false,
    name,
  };
}

function toPathString(path: string | URL) {
  return typeof path === "string" ? path : path.toString();
}
