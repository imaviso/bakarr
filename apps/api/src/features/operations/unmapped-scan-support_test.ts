import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { withFileSystemSandboxEffect, writeTextFile } from "@/test/filesystem-test.ts";
import { ensureFolderMatchStatus } from "@/features/operations/unmapped-folder-list-support.ts";
import { loadUnmappedFolderVideoSize } from "@/features/operations/unmapped-scan-video-support.ts";

it.scoped("loadUnmappedFolderVideoSize sums nested video files", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const seasonDir = `${root}/Season 1`;
      yield* fs.mkdir(seasonDir, { recursive: true });
      yield* fs.writeFile(`${seasonDir}/episode-01.mkv`, new Uint8Array(10));
      yield* fs.writeFile(`${seasonDir}/episode-02.mp4`, new Uint8Array(15));
      yield* writeTextFile(fs, `${seasonDir}/readme.txt`, "ignore me");

      const size = yield* loadUnmappedFolderVideoSize(fs, root);

      assert.deepStrictEqual(size, 25);
    }),
  ),
);

it.scoped("loadUnmappedFolderVideoSize fails when folder is inaccessible", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(loadUnmappedFolderVideoSize(fs, `${root}/missing`));

      assert.deepStrictEqual(exit._tag, "Failure");
    }),
  ),
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
    suggested_matches: [
      {
        format: "TV",
        id: 42,
        status: "RELEASING",
        title: { romaji: "Series" },
      },
    ],
  });

  assert.deepStrictEqual(merged.size, 2048);
  assert.deepStrictEqual(merged.match_status, "failed");
  assert.deepStrictEqual(merged.match_attempts, 2);
});
