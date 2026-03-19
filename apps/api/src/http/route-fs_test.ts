import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import type { FileSystemShape } from "../lib/filesystem.ts";
import { browsePath } from "./route-fs.ts";

Deno.test("browsePath returns paginated entries with defaults", async () => {
  const fs = makeMockFileSystem([
    { isDirectory: false, name: "file1.mkv" },
    { isDirectory: false, name: "file2.mkv" },
    { isDirectory: true, name: "subdir" },
  ]);

  const result = await Effect.runPromise(browsePath(fs, "/test"));

  assertEquals(result.current_path, "/test");
  assertEquals(result.total, 3);
  assertEquals(result.limit, 100);
  assertEquals(result.offset, 0);
  assertEquals(result.has_more, false);
  assertEquals(result.entries.length, 3);
  assertEquals(result.parent_path, "/");
});

Deno.test("browsePath respects limit and offset", async () => {
  const fs = makeMockFileSystem([
    { isDirectory: false, name: "a.mkv" },
    { isDirectory: false, name: "b.mkv" },
    { isDirectory: false, name: "c.mkv" },
    { isDirectory: false, name: "d.mkv" },
    { isDirectory: false, name: "e.mkv" },
  ]);

  const page1 = await Effect.runPromise(
    browsePath(fs, "/test", { limit: 2, offset: 0 }),
  );
  assertEquals(page1.entries.length, 2);
  assertEquals(page1.entries[0].name, "a.mkv");
  assertEquals(page1.entries[1].name, "b.mkv");
  assertEquals(page1.has_more, true);
  assertEquals(page1.total, 5);

  const page2 = await Effect.runPromise(
    browsePath(fs, "/test", { limit: 2, offset: 2 }),
  );
  assertEquals(page2.entries.length, 2);
  assertEquals(page2.entries[0].name, "c.mkv");
  assertEquals(page2.entries[1].name, "d.mkv");
  assertEquals(page2.has_more, true);

  const page3 = await Effect.runPromise(
    browsePath(fs, "/test", { limit: 2, offset: 4 }),
  );
  assertEquals(page3.entries.length, 1);
  assertEquals(page3.entries[0].name, "e.mkv");
  assertEquals(page3.has_more, false);
});

Deno.test("browsePath caps limit at MAX_BROWSE_LIMIT", async () => {
  const fs = makeMockFileSystem([]);

  const result = await Effect.runPromise(
    browsePath(fs, "/test", { limit: 10000 }),
  );
  assertEquals(result.limit, 500);
});

Deno.test("browsePath floors limit at 1", async () => {
  const fs = makeMockFileSystem([]);

  const result = await Effect.runPromise(browsePath(fs, "/test", { limit: 0 }));
  assertEquals(result.limit, 1);
});

Deno.test("browsePath floors negative offset at 0", async () => {
  const fs = makeMockFileSystem([]);

  const result = await Effect.runPromise(
    browsePath(fs, "/test", { offset: -10 }),
  );
  assertEquals(result.offset, 0);
});

Deno.test("browsePath sorts directories before files", async () => {
  const fs = makeMockFileSystem([
    { isDirectory: false, name: "zfile.mkv" },
    { isDirectory: true, name: "adir" },
    { isDirectory: false, name: "afile.mkv" },
    { isDirectory: true, name: "zdir" },
  ]);

  const result = await Effect.runPromise(browsePath(fs, "/test"));
  assertEquals(result.entries.length, 4);
  assertEquals(result.entries[0].is_directory, true);
  assertEquals(result.entries[1].is_directory, true);
  assertEquals(result.entries[2].is_directory, false);
  assertEquals(result.entries[3].is_directory, false);
});

Deno.test("browsePath returns empty page when offset exceeds total", async () => {
  const fs = makeMockFileSystem([
    { isDirectory: false, name: "a.mkv" },
  ]);

  const result = await Effect.runPromise(
    browsePath(fs, "/test", { limit: 1, offset: 10 }),
  );

  assertEquals(result.entries.length, 0);
  assertEquals(result.total, 1);
  assertEquals(result.offset, 10);
  assertEquals(result.has_more, false);
});

function makeMockFileSystem(
  entries: Array<{ isDirectory: boolean; name: string; size?: number }>,
): FileSystemShape {
  return {
    copyFile: () => Effect.die("unused"),
    mkdir: () => Effect.void,
    openFile: () => Effect.die("unused"),
    readDir: () =>
      Effect.succeed(
        entries.map((e) => ({ ...e, isFile: !e.isDirectory } as Deno.DirEntry)),
      ),
    readFile: () => Effect.die("unused"),
    realPath: (p) => Effect.succeed(typeof p === "string" ? p : p.toString()),
    remove: () => Effect.die("unused"),
    rename: () => Effect.die("unused"),
    stat: (p) => {
      const path = typeof p === "string" ? p : p.toString();
      const name = path.split("/").pop() ?? "";
      const entry = entries.find((e) => e.name === name);
      if (entry) {
        return Effect.succeed({
          isFile: !entry.isDirectory,
          isDirectory: entry.isDirectory,
          size: entry.size ?? 0,
        } as Deno.FileInfo);
      }
      return Effect.succeed(
        { isFile: false, isDirectory: false, size: 0 } as Deno.FileInfo,
      );
    },
    writeFile: () => Effect.die("unused"),
  };
}
