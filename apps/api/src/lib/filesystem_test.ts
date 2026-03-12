import { assertEquals } from "@std/assert";

import { isWithinPathRoot } from "./filesystem.ts";

Deno.test("isWithinPathRoot only matches the configured root boundary", () => {
  assertEquals(isWithinPathRoot("/data/downloads", "/data/downloads"), true);
  assertEquals(
    isWithinPathRoot("/data/downloads/show/episode.mkv", "/data/downloads"),
    true,
  );
  assertEquals(
    isWithinPathRoot(
      "/data/downloads-evil/show/episode.mkv",
      "/data/downloads",
    ),
    false,
  );
  assertEquals(
    isWithinPathRoot("/data/downloads-other", "/data/downloads/"),
    false,
  );
});

Deno.test("isWithinPathRoot accepts Windows-style child paths", () => {
  assertEquals(
    isWithinPathRoot(
      "C:\\downloads\\show\\episode.mkv",
      "C:\\downloads",
    ),
    true,
  );
  assertEquals(
    isWithinPathRoot(
      "C:\\downloads-evil\\show\\episode.mkv",
      "C:\\downloads",
    ),
    false,
  );
});
