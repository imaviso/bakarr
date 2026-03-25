import { assertEquals, it } from "../test/vitest.ts";
import { Effect } from "effect";

import { makeNoopTestFileSystemWithOverridesEffect } from "../test/filesystem-test.ts";
import { browsePath } from "./route-fs.ts";

it.effect("browsePath returns paginated entries with defaults", () =>
  Effect.gen(function* () {
    const fs = yield* makeMockFileSystemEffect([
      { isDirectory: false, name: "file1.mkv" },
      { isDirectory: false, name: "file2.mkv" },
      { isDirectory: true, name: "subdir" },
    ]);

    const result = yield* browsePath(fs, "/test");

    assertEquals(result.current_path, "/test");
    assertEquals(result.total, 3);
    assertEquals(result.limit, 3);
    assertEquals(result.offset, 0);
    assertEquals(result.has_more, false);
    assertEquals(result.entries.length, 3);
    assertEquals(result.parent_path, "/");
  })
);

it.effect("browsePath returns all entries when limit is omitted", () =>
  Effect.gen(function* () {
    const fs = yield* makeMockFileSystemEffect(
      Array.from({ length: 600 }, (_, index) => ({
        isDirectory: false,
        name: `file-${index}.mkv`,
      })),
    );

    const result = yield* browsePath(fs, "/test");

    assertEquals(result.entries.length, 600);
    assertEquals(result.total, 600);
    assertEquals(result.has_more, false);
    assertEquals(result.limit, 600);
  })
);

it.effect("browsePath respects limit and offset", () =>
  Effect.gen(function* () {
    const fs = yield* makeMockFileSystemEffect([
      { isDirectory: false, name: "a.mkv" },
      { isDirectory: false, name: "b.mkv" },
      { isDirectory: false, name: "c.mkv" },
      { isDirectory: false, name: "d.mkv" },
      { isDirectory: false, name: "e.mkv" },
    ]);

    const page1 = yield* browsePath(fs, "/test", { limit: 2, offset: 0 });
    assertEquals(page1.entries.length, 2);
    assertEquals(page1.entries[0].name, "a.mkv");
    assertEquals(page1.entries[1].name, "b.mkv");
    assertEquals(page1.has_more, true);
    assertEquals(page1.total, 5);

    const page2 = yield* browsePath(fs, "/test", { limit: 2, offset: 2 });
    assertEquals(page2.entries.length, 2);
    assertEquals(page2.entries[0].name, "c.mkv");
    assertEquals(page2.entries[1].name, "d.mkv");
    assertEquals(page2.has_more, true);

    const page3 = yield* browsePath(fs, "/test", { limit: 2, offset: 4 });
    assertEquals(page3.entries.length, 1);
    assertEquals(page3.entries[0].name, "e.mkv");
    assertEquals(page3.has_more, false);
  })
);

it.effect("browsePath caps limit at MAX_BROWSE_LIMIT", () =>
  Effect.gen(function* () {
    const fs = yield* makeMockFileSystemEffect([]);
    const result = yield* browsePath(fs, "/test", { limit: 10000 });
    assertEquals(result.limit, 500);
  })
);

it.effect("browsePath floors limit at 1", () =>
  Effect.gen(function* () {
    const fs = yield* makeMockFileSystemEffect([]);
    const result = yield* browsePath(fs, "/test", { limit: 0 });
    assertEquals(result.limit, 1);
  })
);

it.effect("browsePath floors negative offset at 0", () =>
  Effect.gen(function* () {
    const fs = yield* makeMockFileSystemEffect([]);
    const result = yield* browsePath(fs, "/test", { offset: -10 });
    assertEquals(result.offset, 0);
  })
);

it.effect("browsePath sorts directories before files", () =>
  Effect.gen(function* () {
    const fs = yield* makeMockFileSystemEffect([
      { isDirectory: false, name: "zfile.mkv" },
      { isDirectory: true, name: "adir" },
      { isDirectory: false, name: "afile.mkv" },
      { isDirectory: true, name: "zdir" },
    ]);

    const result = yield* browsePath(fs, "/test");
    assertEquals(result.entries.length, 4);
    assertEquals(result.entries[0].is_directory, true);
    assertEquals(result.entries[1].is_directory, true);
    assertEquals(result.entries[2].is_directory, false);
    assertEquals(result.entries[3].is_directory, false);
  })
);

it.effect("browsePath returns empty page when offset exceeds total", () =>
  Effect.gen(function* () {
    const fs = yield* makeMockFileSystemEffect([
      { isDirectory: false, name: "a.mkv" },
    ]);

    const result = yield* browsePath(fs, "/test", { limit: 1, offset: 10 });

    assertEquals(result.entries.length, 0);
    assertEquals(result.total, 1);
    assertEquals(result.offset, 10);
    assertEquals(result.has_more, false);
  })
);

const makeMockFileSystemEffect = Effect.fn("RouteFsTest.makeMockFileSystem")((
  entries: Array<{ isDirectory: boolean; name: string; size?: number }>,
) =>
  makeNoopTestFileSystemWithOverridesEffect({
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
  })
);
