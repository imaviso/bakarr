import { assertEquals } from "@std/assert";

import { Effect, Stream } from "effect";

import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { runTestEffect } from "../../test/effect-test.ts";
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
  readFile: () => Effect.die("unused"),
  readDir: (path) =>
    path === "/library/show/season-2/broken"
      ? Effect.fail(
        new FileSystemError({
          cause: new Error("denied"),
          message: "Failed to read directory",
          path,
        }),
      )
      : Effect.succeed(tree.get(path) ?? []),
  realPath: (path) => Effect.succeed(path),
  stat: () => Effect.die("unused"),
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
    files.map((file) => file.path),
    [
      "/library/show/episode-01.mkv",
      "/library/show/season-2/episode-02.mp4",
    ],
  );
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
