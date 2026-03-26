import { assertEquals, assertThrows, it } from "../test/vitest.ts";

import { isWithinPathRoot, sanitizePathSegment } from "./filesystem.ts";

it("isWithinPathRoot only matches the configured root boundary", () => {
  assertEquals(isWithinPathRoot("/data/downloads", "/data/downloads"), true);
  assertEquals(isWithinPathRoot("/data/downloads/show/episode.mkv", "/data/downloads"), true);
  assertEquals(isWithinPathRoot("/data/downloads-evil/show/episode.mkv", "/data/downloads"), false);
  assertEquals(isWithinPathRoot("/data/downloads-other", "/data/downloads/"), false);
});

it("isWithinPathRoot accepts Windows-style child paths", () => {
  assertEquals(isWithinPathRoot("C:\\downloads\\show\\episode.mkv", "C:\\downloads"), true);
  assertEquals(isWithinPathRoot("C:\\downloads-evil\\show\\episode.mkv", "C:\\downloads"), false);
});

it("isWithinPathRoot handles relative paths", () => {
  assertEquals(isWithinPathRoot("./library/show/episode.mkv", "./library"), true);
  assertEquals(isWithinPathRoot("./library-evil/show/episode.mkv", "./library"), false);
});

it("sanitizePathSegment rejects traversal and nested path inputs", () => {
  for (const value of ["../etc", "..", "nested/show", "nested\\show", ""]) {
    assertThrows(() => sanitizePathSegment(value), Error);
  }
});

it("sanitizePathSegment allows plain folder names within root", () => {
  const segment = sanitizePathSegment("My Show Season 2");
  const libraryRoot = "/library";
  const folderPath = `${libraryRoot}/${segment}`;

  assertEquals(segment, "My Show Season 2");
  assertEquals(isWithinPathRoot(folderPath, libraryRoot), true);
});
