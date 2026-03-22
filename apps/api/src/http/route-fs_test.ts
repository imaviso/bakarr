import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import { makeNoopTestFileSystemWithOverrides } from "../test/filesystem-test.ts";
import { browsePath } from "./route-fs.ts";

Deno.test("browsePath returns paginated entries with defaults", async () => {
  const fs = await makeMockFileSystem([
    { isDirectory: false, name: "file1.mkv" },
    { isDirectory: false, name: "file2.mkv" },
    { isDirectory: true, name: "subdir" },
  ]);

  const result = await Effect.runPromise(browsePath(fs, "/test"));

  assertEquals(result.current_path, "/test");
  assertEquals(result.total, 3);
  assertEquals(result.limit, 3);
  assertEquals(result.offset, 0);
  assertEquals(result.has_more, false);
  assertEquals(result.entries.length, 3);
  assertEquals(result.parent_path, "/");
});

Deno.test("browsePath returns all entries when limit is omitted", async () => {
  const fs = await makeMockFileSystem(
    Array.from({ length: 600 }, (_, index) => ({
      isDirectory: false,
      name: `file-${index}.mkv`,
    })),
  );

  const result = await Effect.runPromise(browsePath(fs, "/test"));

  assertEquals(result.entries.length, 600);
  assertEquals(result.total, 600);
  assertEquals(result.has_more, false);
  assertEquals(result.limit, 600);
});

Deno.test("browsePath respects limit and offset", async () => {
  const fs = await makeMockFileSystem([
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
  const fs = await makeMockFileSystem([]);

  const result = await Effect.runPromise(
    browsePath(fs, "/test", { limit: 10000 }),
  );
  assertEquals(result.limit, 500);
});

Deno.test("browsePath floors limit at 1", async () => {
  const fs = await makeMockFileSystem([]);

  const result = await Effect.runPromise(browsePath(fs, "/test", { limit: 0 }));
  assertEquals(result.limit, 1);
});

Deno.test("browsePath floors negative offset at 0", async () => {
  const fs = await makeMockFileSystem([]);

  const result = await Effect.runPromise(
    browsePath(fs, "/test", { offset: -10 }),
  );
  assertEquals(result.offset, 0);
});

Deno.test("browsePath sorts directories before files", async () => {
  const fs = await makeMockFileSystem([
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
  const fs = await makeMockFileSystem([
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
) {
  return makeNoopTestFileSystemWithOverrides({
    readDir: () =>
      Effect.succeed(
        entries.map((entry) => ({
          isDirectory: entry.isDirectory,
          isFile: !entry.isDirectory,
          isSymlink: false,
          name: entry.name,
        })),
      ),
    stat: (path) => {
      const pathString = typeof path === "string" ? path : path.toString();
      const name = pathString.split("/").pop() ?? "";
      const entry = entries.find((candidate) => candidate.name === name);

      return Effect.succeed({
        isDirectory: entry?.isDirectory ?? false,
        isFile: entry ? !entry.isDirectory : false,
        isSymlink: false,
        size: entry?.size ?? 0,
      });
    },
  });
}
