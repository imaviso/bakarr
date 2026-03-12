import { assertEquals } from "@std/assert";

import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { scanVideoFiles, scanVideoFilesIterator } from "./file-scanner.ts";
import { Effect } from "effect";

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
  remove: () => Effect.die("unused"),
};

Deno.test("scanVideoFilesIterator streams matching files and skips bad dirs", async () => {
  const files: string[] = [];

  for await (const file of scanVideoFilesIterator(mockFs, "/library")) {
    files.push(file.path);
  }

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
