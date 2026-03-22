import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import { runTestEffect } from "../test/effect-test.ts";
import { makeNoopTestFileSystem } from "../test/filesystem-test.ts";

Deno.test("filesystem noop layer can override readFile behavior", async () => {
  const fs = await makeNoopTestFileSystem({
    readFile: () => Effect.succeed(Uint8Array.from([1, 2, 3])),
  });

  const bytes = await runTestEffect(
    fs.readFile("/virtual/file.bin"),
  );

  assertEquals(Array.from(bytes), [1, 2, 3]);
});
