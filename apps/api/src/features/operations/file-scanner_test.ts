import { assertEquals } from "@std/assert";

import { Effect, Stream } from "effect";

import { type DirEntry, FileSystemError } from "../../lib/filesystem.ts";
import { runTestEffect, runTestEffectExit } from "../../test/effect-test.ts";
import { makeNoopTestFileSystemWithOverrides } from "../../test/filesystem-test.ts";
import { scanVideoFiles, scanVideoFilesStream } from "./file-scanner.ts";

const tree = new Map<string, DirEntry[]>([
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

Deno.test("scanVideoFilesStream streams matching files from accessible tree", async () => {
  const mockFs = await makeAccessibleMockFs();

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
  const mockFs = await makeAccessibleMockFs();
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
  const mockFs = await makeMockFs();
  const exit = await runTestEffectExit(
    scanVideoFiles(mockFs, "/library/show/season-2/broken"),
  );

  assertEquals(exit._tag, "Failure");
});

Deno.test("scanVideoFilesStream uses streaming dir reader when available", async () => {
  const mockFs = await makeMockFs();
  let streamed = 0;
  const readDirError = new FileSystemError({
    cause: new Error("readDir should not be used"),
    message: "readDir should not be used",
    path: "/library",
  });
  const streamingFs = {
    ...mockFs,
    readDir: () => Effect.fail(readDirError),
    readDirStream: (path: string | URL) => {
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

Deno.test("scanVideoFilesStream handles symlink cycles without infinite recursion", async () => {
  const symlinksTree = new Map<string, DirEntry[]>([
    [
      "/library",
      [
        entry("show", { isDirectory: true }),
        entry("link-to-show", { isSymlink: true }),
        entry("cycle", { isSymlink: true }),
      ],
    ],
    [
      "/library/show",
      [
        entry("episode.mkv", { isFile: true }),
      ],
    ],
  ]);

  const symlinkFs = await makeNoopTestFileSystemWithOverrides({
    readDir: (path) =>
      Effect.succeed(symlinksTree.get(toPathString(path)) ?? []),
    readDirStream: (path) =>
      Stream.fromIterable(symlinksTree.get(toPathString(path)) ?? []),
    realPath: (path) => {
      const pathStr = toPathString(path);
      if (pathStr.endsWith("/link-to-show")) {
        return Effect.succeed("/library/show");
      }
      if (pathStr.endsWith("/cycle")) {
        return Effect.succeed("/library/cycle");
      }
      return Effect.succeed(pathStr);
    },
    stat: (path) =>
      Effect.succeed({
        size: 100,
        isFile: toPathString(path).endsWith(".mkv"),
        isDirectory: !toPathString(path).endsWith(".mkv"),
        isSymlink: false,
      }),
  });

  const files = await runTestEffect(
    Stream.runCollect(scanVideoFilesStream(symlinkFs, "/library")).pipe(
      Effect.map((items) => Array.from(items, (file) => file.path)),
    ),
  );

  assertEquals(files.length, 1);
  assertEquals(files[0], "/library/show/episode.mkv");
});

Deno.test("scanVideoFilesStream fails when encountering inaccessible subdirectory", async () => {
  const inaccessibleTree = new Map<string, DirEntry[]>([
    [
      "/library",
      [
        entry("show1", { isDirectory: true }),
        entry("show2", { isDirectory: true }),
        entry("show3", { isDirectory: true }),
      ],
    ],
    [
      "/library/show1",
      [
        entry("video1.mkv", { isFile: true }),
      ],
    ],
    [
      "/library/show2",
      [], // Will cause error
    ],
    [
      "/library/show3",
      [
        entry("video2.mp4", { isFile: true }),
      ],
    ],
  ]);

  const inaccessibleFs = await makeNoopTestFileSystemWithOverrides({
    readDir: (path) =>
      toPathString(path) === "/library/show2"
        ? Effect.fail(
          new FileSystemError({
            cause: { code: "EACCES" },
            message: "Permission denied",
            path: toPathString(path),
          }),
        )
        : Effect.succeed(inaccessibleTree.get(toPathString(path)) ?? []),
    readDirStream: (path) =>
      toPathString(path) === "/library/show2"
        ? Stream.fail(
          new FileSystemError({
            cause: { code: "EACCES" },
            message: "Permission denied",
            path: toPathString(path),
          }),
        )
        : Stream.fromIterable(inaccessibleTree.get(toPathString(path)) ?? []),
    realPath: (path) => Effect.succeed(toPathString(path)),
    stat: (path) =>
      Effect.succeed({
        size: 100,
        isFile: toPathString(path).includes("video"),
        isDirectory: !toPathString(path).includes("video"),
        isSymlink: false,
      }),
  });

  const exit = await runTestEffectExit(
    Stream.runCollect(scanVideoFilesStream(inaccessibleFs, "/library")),
  );

  assertEquals(exit._tag, "Failure");
});

function entry(
  name: string,
  options: { isDirectory?: boolean; isFile?: boolean; isSymlink?: boolean },
): DirEntry {
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

function makeMockFs() {
  return makeNoopTestFileSystemWithOverrides({
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
        : Stream.fromIterable(tree.get(toPathString(path)) ?? []),
    realPath: (path) => Effect.succeed(toPathString(path)),
    stat: (path) =>
      Effect.succeed({
        isDirectory: false,
        isFile: true,
        isSymlink: false,
        size: toPathString(path).endsWith("episode-01.mkv") ? 100 : 200,
      }),
  });
}

function makeAccessibleMockFs() {
  return makeNoopTestFileSystemWithOverrides({
    readDir: (path) => Effect.succeed(tree.get(toPathString(path)) ?? []),
    readDirStream: (path) =>
      Stream.fromIterable(tree.get(toPathString(path)) ?? []),
    realPath: (path) => Effect.succeed(toPathString(path)),
    stat: (path) =>
      Effect.succeed({
        isDirectory: false,
        isFile: true,
        isSymlink: false,
        size: toPathString(path).endsWith("episode-01.mkv") ? 100 : 200,
      }),
  });
}
