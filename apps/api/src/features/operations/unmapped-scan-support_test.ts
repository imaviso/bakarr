import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { loadUnmappedFolderVideoSize } from "./unmapped-scan-support.ts";

Deno.test("loadUnmappedFolderVideoSize sums nested video files", async () => {
  const root = await Deno.makeTempDir();

  try {
    await Deno.mkdir(`${root}/Season 1`);
    await Deno.writeFile(`${root}/Season 1/episode-01.mkv`, new Uint8Array(10));
    await Deno.writeFile(`${root}/Season 1/episode-02.mp4`, new Uint8Array(15));
    await Deno.writeTextFile(`${root}/Season 1/readme.txt`, "ignore me");

    const size = await Effect.runPromise(
      loadUnmappedFolderVideoSize(makeScanFs(), root),
    );

    assertEquals(size, 25);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

function makeScanFs(): FileSystemShape {
  const unsupported = () => Effect.die("unused file system method");

  return {
    copyFile: () => unsupported(),
    mkdir: () => unsupported(),
    openFile: () => unsupported(),
    readDir: (path) =>
      Effect.tryPromise({
        try: () => Array.fromAsync(Deno.readDir(path)),
        catch: (cause) =>
          new FileSystemError({
            cause,
            message: "Failed to read directory",
            path: String(path),
          }),
      }),
    readFile: () => unsupported(),
    realPath: () => unsupported(),
    remove: () => unsupported(),
    rename: () => unsupported(),
    stat: (path) =>
      Effect.tryPromise({
        try: () => Deno.stat(path),
        catch: (cause) =>
          new FileSystemError({
            cause,
            message: "Failed to stat path",
            path: String(path),
          }),
      }),
    writeFile: () => unsupported(),
  };
}
