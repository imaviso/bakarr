import assert from "node:assert/strict";
import { it } from "@effect/vitest";

import { Effect, Stream } from "effect";

import { type DirEntry, FileSystemError } from "@/lib/filesystem.ts";
import { makeNoopTestFileSystemWithOverridesEffect } from "@/test/filesystem-test.ts";
import { scanVideoFiles, scanVideoFilesStream } from "@/features/operations/file-scanner.ts";

const tree = new Map<string, DirEntry[]>([
  ["/library", [entry("show", { isDirectory: true }), entry("notes.txt", { isFile: true })]],
  [
    "/library/show",
    [entry("episode-01.mkv", { isFile: true }), entry("season-2", { isDirectory: true })],
  ],
  [
    "/library/show/season-2",
    [entry("episode-02.mp4", { isFile: true }), entry("broken", { isDirectory: true })],
  ],
]);

it.effect("scanVideoFilesStream streams matching files from accessible tree", () =>
  Effect.gen(function* () {
    const mockFs = yield* makeAccessibleMockFs();

    const files = yield* Stream.runCollect(scanVideoFilesStream(mockFs, "/library")).pipe(
      Effect.map((items) => Array.from(items, (file) => file.path)),
    );

    assert.deepStrictEqual(files, [
      "/library/show/episode-01.mkv",
      "/library/show/season-2/episode-02.mp4",
    ]);
  }),
);

it.effect("scanVideoFiles collects iterator output", () =>
  Effect.gen(function* () {
    const mockFs = yield* makeAccessibleMockFs();
    const files = yield* scanVideoFiles(mockFs, "/library");

    assert.deepStrictEqual(files, [
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
    ]);
  }),
);

it.effect("scanVideoFiles fails when the root path is inaccessible", () =>
  Effect.gen(function* () {
    const mockFs = yield* makeMockFs();
    const exit = yield* Effect.exit(scanVideoFiles(mockFs, "/library/show/season-2/broken"));

    assert.deepStrictEqual(exit._tag, "Failure");
  }),
);

it.effect("scanVideoFilesStream uses streaming dir reader when available", () =>
  Effect.gen(function* () {
    const mockFs = yield* makeMockFs();
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

    const files = yield* Stream.runCollect(scanVideoFilesStream(streamingFs, "/library")).pipe(
      Effect.map((items) => Array.from(items, (file) => file.path)),
    );

    assert.deepStrictEqual(files, [
      "/library/show/episode-01.mkv",
      "/library/show/season-2/episode-02.mp4",
    ]);
    assert.deepStrictEqual(streamed > 0, true);
  }),
);

it.effect("scanVideoFilesStream handles symlink cycles without infinite recursion", () =>
  Effect.gen(function* () {
    const symlinksTree = new Map<string, DirEntry[]>([
      [
        "/library",
        [
          entry("show", { isDirectory: true }),
          entry("link-to-show", { isSymlink: true }),
          entry("cycle", { isSymlink: true }),
        ],
      ],
      ["/library/show", [entry("episode.mkv", { isFile: true })]],
    ]);

    const symlinkFs = yield* makeNoopTestFileSystemWithOverridesEffect({
      readDir: (path) => Effect.succeed(symlinksTree.get(toPathString(path)) ?? []),
      readDirStream: (path) => Stream.fromIterable(symlinksTree.get(toPathString(path)) ?? []),
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

    const files = yield* Stream.runCollect(scanVideoFilesStream(symlinkFs, "/library")).pipe(
      Effect.map((items) => Array.from(items, (file) => file.path)),
    );

    assert.deepStrictEqual(files.length, 1);
    assert.deepStrictEqual(files[0], "/library/show/episode.mkv");
  }),
);

it.effect("scanVideoFilesStream fails when encountering inaccessible subdirectory", () =>
  Effect.gen(function* () {
    const inaccessibleTree = new Map<string, DirEntry[]>([
      [
        "/library",
        [
          entry("show1", { isDirectory: true }),
          entry("show2", { isDirectory: true }),
          entry("show3", { isDirectory: true }),
        ],
      ],
      ["/library/show1", [entry("video1.mkv", { isFile: true })]],
      [
        "/library/show2",
        [], // Will cause error
      ],
      ["/library/show3", [entry("video2.mp4", { isFile: true })]],
    ]);

    const inaccessibleFs = yield* makeNoopTestFileSystemWithOverridesEffect({
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

    const exit = yield* Effect.exit(
      Stream.runCollect(scanVideoFilesStream(inaccessibleFs, "/library")),
    );

    assert.deepStrictEqual(exit._tag, "Failure");
  }),
);

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
  return makeNoopTestFileSystemWithOverridesEffect({
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
  return makeNoopTestFileSystemWithOverridesEffect({
    readDir: (path) => Effect.succeed(tree.get(toPathString(path)) ?? []),
    readDirStream: (path) => Stream.fromIterable(tree.get(toPathString(path)) ?? []),
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
