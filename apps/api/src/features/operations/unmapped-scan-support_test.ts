import { assertEquals, it } from "../../test/vitest.ts";
import { Effect } from "effect";
import {
  withFileSystemSandboxEffect,
  writeTextFile,
} from "../../test/filesystem-test.ts";
import {
  ensureFolderMatchStatus,
  loadUnmappedFolderVideoSize,
} from "./unmapped-scan-support.ts";

it.scoped("loadUnmappedFolderVideoSize sums nested video files", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
    const seasonDir = `${root}/Season 1`;
      yield* fs.mkdir(seasonDir, { recursive: true });
      yield* fs.writeFile(`${seasonDir}/episode-01.mkv`, new Uint8Array(10));
      yield* fs.writeFile(`${seasonDir}/episode-02.mp4`, new Uint8Array(15));
      yield* writeTextFile(fs, `${seasonDir}/readme.txt`, "ignore me");

      const size = yield* loadUnmappedFolderVideoSize(fs, root);

      assertEquals(size, 25);
    })
  )
);

it.scoped("loadUnmappedFolderVideoSize fails when folder is inaccessible", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        loadUnmappedFolderVideoSize(fs, `${root}/missing`),
      );

      assertEquals(exit._tag, "Failure");
    })
  )
);

it("ensureFolderMatchStatus preserves cached size", () => {
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
