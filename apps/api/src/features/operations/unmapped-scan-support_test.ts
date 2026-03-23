import { assertEquals } from "@std/assert";
import { runTestEffect, runTestEffectExit } from "../../test/effect-test.ts";
import {
  withFileSystemSandbox,
  writeTextFile,
} from "../../test/filesystem-test.ts";
import {
  ensureFolderMatchStatus,
  loadUnmappedFolderVideoSize,
} from "./unmapped-scan-support.ts";

Deno.test("loadUnmappedFolderVideoSize sums nested video files", async () => {
  await withFileSystemSandbox(async ({ fs, root }) => {
    const seasonDir = `${root}/Season 1`;
    await runTestEffect(fs.mkdir(seasonDir, { recursive: true }));
    await runTestEffect(
      fs.writeFile(`${seasonDir}/episode-01.mkv`, new Uint8Array(10)),
    );
    await runTestEffect(
      fs.writeFile(`${seasonDir}/episode-02.mp4`, new Uint8Array(15)),
    );
    await runTestEffect(
      writeTextFile(fs, `${seasonDir}/readme.txt`, "ignore me"),
    );

    const size = await runTestEffect(
      loadUnmappedFolderVideoSize(fs, root),
    );

    assertEquals(size, 25);
  });
});

Deno.test("loadUnmappedFolderVideoSize fails when folder is inaccessible", async () => {
  await withFileSystemSandbox(async ({ fs, root }) => {
    const exit = await runTestEffectExit(
      loadUnmappedFolderVideoSize(fs, `${root}/missing`),
    );

    assertEquals(exit._tag, "Failure");
  });
});

Deno.test("ensureFolderMatchStatus preserves cached size", () => {
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
