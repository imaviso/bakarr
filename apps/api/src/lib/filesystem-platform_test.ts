import { assertEquals, it } from "../test/vitest.ts";
import { Effect } from "effect";

import { makeNoopTestFileSystemEffect } from "../test/filesystem-test.ts";

it.effect("filesystem noop layer can override readFile behavior", () =>
  Effect.gen(function* () {
    const fs = yield* makeNoopTestFileSystemEffect({
      readFile: () => Effect.succeed(Uint8Array.from([1, 2, 3])),
    });

    const bytes = yield* fs.readFile("/virtual/file.bin");

    assertEquals(Array.from(bytes), [1, 2, 3]);
  })
);
