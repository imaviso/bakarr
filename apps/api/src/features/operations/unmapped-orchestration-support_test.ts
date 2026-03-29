import { assertEquals, it } from "@/test/vitest.ts";
import { Effect } from "effect";

import { FileSystemError } from "@/lib/filesystem.ts";
import { makeNoopTestFileSystemWithOverridesEffect } from "@/test/filesystem-test.ts";
import { cleanupPreviousAnimeRootFolderAfterImport } from "@/features/operations/unmapped-orchestration-support.ts";

it.effect(
  "cleanupPreviousAnimeRootFolderAfterImport skips removal when previous folder cannot be read",
  () =>
    Effect.gen(function* () {
      let removeCalls = 0;

      const fs = yield* makeNoopTestFileSystemWithOverridesEffect({
        readDir: (path) =>
          Effect.fail(
            new FileSystemError({
              cause: new Error("EACCES"),
              message: "Failed to read directory",
              path: path.toString(),
            }),
          ),
        remove: () => {
          removeCalls += 1;
          return Effect.void;
        },
      });

      yield* cleanupPreviousAnimeRootFolderAfterImport(
        fs,
        "/library/Old Show",
        "/library/New Show",
      );

      assertEquals(removeCalls, 0);
    }),
);
