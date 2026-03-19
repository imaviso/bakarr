import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import {
  ensureFolderMatchStatus,
  loadUnmappedFolderVideoSize,
} from "./unmapped-scan-support.ts";

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

Deno.test("ensureFolderMatchStatus preserves cached size", () => {
  const folder = {
    match_status: "pending" as const,
    name: "Series",
    path: "/library/Series",
    search_queries: ["Series"],
    size: 0,
    suggested_matches: [],
  };

  const merged = ensureFolderMatchStatus(folder, {
    ...folder,
    match_attempts: 2,
    match_status: "failed",
    size: 2048,
    suggested_matches: [{
      format: "TV",
      id: 42,
      status: "RELEASING",
      title: { romaji: "Series" },
    }],
  });

  assertEquals(merged.size, 2048);
  assertEquals(merged.match_status, "failed");
  assertEquals(merged.match_attempts, 2);
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
