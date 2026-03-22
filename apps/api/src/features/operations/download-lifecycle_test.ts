import { assertEquals } from "@std/assert";

import {
  applyRemotePathMappings,
  inferCoveredEpisodeNumbers,
  inferCoveredEpisodesFromTorrentContents,
  parseCoveredEpisodes,
  parseMagnetInfoHash,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
  resolveReconciledBatchEpisodeNumbers,
  toCoveredEpisodesJson,
} from "./download-lifecycle.ts";
import { runTestEffect } from "../../test/effect-test.ts";
import {
  withFileSystemSandbox,
  writeTextFile,
} from "../../test/filesystem-test.ts";

const filesystemTestPermissions: Deno.PermissionOptions = {
  read: true,
  write: true,
};

function filesystemTest(name: string, fn: () => void | Promise<void>) {
  Deno.test({ fn, name, permissions: filesystemTestPermissions });
}

filesystemTest("parseMagnetInfoHash extracts btih from magnet links", () => {
  assertEquals(
    parseMagnetInfoHash("magnet:?xt=urn:btih:ABCDEF1234567890&dn=Example"),
    "abcdef1234567890",
  );
  assertEquals(parseMagnetInfoHash(undefined), undefined);
});

filesystemTest(
  "resolveCompletedContentPath prefers matching episode files inside directories",
  async () => {
    await withFileSystemSandbox(async ({ fs, root }) => {
      const dir = `${root}/completed`;
      await runTestEffect(fs.mkdir(dir, { recursive: true }));
      const first = `${dir}/Show - 01.mkv`;
      const second = `${dir}/Show - 02.mkv`;
      await runTestEffect(writeTextFile(fs, first, "one"));
      await runTestEffect(writeTextFile(fs, second, "two"));

      assertEquals(
        await runTestEffect(resolveCompletedContentPath(fs, dir, 2)),
        second,
      );
      assertEquals(
        await runTestEffect(resolveCompletedContentPath(fs, first, 1)),
        first,
      );
    });
  },
);

filesystemTest(
  "resolveCompletedContentPath matches daily files by expected air date",
  async () => {
    await withFileSystemSandbox(async ({ fs, root }) => {
      const dir = `${root}/daily`;
      await runTestEffect(fs.mkdir(dir, { recursive: true }));
      const first = `${dir}/Show - 2025-03-14.mkv`;
      const second = `${dir}/Show - 2025-03-21.mkv`;
      await runTestEffect(writeTextFile(fs, first, "one"));
      await runTestEffect(writeTextFile(fs, second, "two"));

      assertEquals(
        await runTestEffect(
          resolveCompletedContentPath(fs, dir, 1, {
            expectedAirDate: "2025-03-21",
          }),
        ),
        second,
      );
    });
  },
);

filesystemTest(
  "resolveCompletedContentPath falls back to a lone generic video file",
  async () => {
    await withFileSystemSandbox(async ({ fs, root }) => {
      const dir = `${root}/generic`;
      await runTestEffect(fs.mkdir(dir, { recursive: true }));
      const file = `${dir}/download.mkv`;
      await runTestEffect(writeTextFile(fs, file, "video"));

      assertEquals(
        await runTestEffect(resolveCompletedContentPath(fs, dir, 7)),
        file,
      );
    });
  },
);

filesystemTest(
  "resolveBatchContentPaths collects video files from completed batch directories",
  async () => {
    await withFileSystemSandbox(async ({ fs, root }) => {
      const dir = `${root}/batch-dir`;
      await runTestEffect(fs.mkdir(dir, { recursive: true }));
      const first = `${dir}/Show - 01.mkv`;
      const second = `${dir}/Show - 02.mp4`;
      const ignored = `${dir}/note.txt`;
      await runTestEffect(writeTextFile(fs, first, "one"));
      await runTestEffect(writeTextFile(fs, second, "two"));
      await runTestEffect(writeTextFile(fs, ignored, "ignore"));

      assertEquals(await runTestEffect(resolveBatchContentPaths(fs, dir)), [
        first,
        second,
      ]);
    });
  },
);

filesystemTest(
  "resolveBatchContentPaths returns a single file for batch torrents stored as one file",
  async () => {
    await withFileSystemSandbox(async ({ fs, root }) => {
      const file = `${root}/Show Season Pack.mkv`;
      await runTestEffect(writeTextFile(fs, file, "season"));

      assertEquals(await runTestEffect(resolveBatchContentPaths(fs, file)), [
        file,
      ]);
    });
  },
);

filesystemTest(
  "inferCoveredEpisodeNumbers prefers explicit ranges and falls back to missing tails for batches",
  () => {
    assertEquals(
      inferCoveredEpisodeNumbers({
        explicitEpisodes: [3, 4, 5],
        isBatch: true,
        missingEpisodes: [3, 4, 5, 6],
        requestedEpisode: 3,
        totalEpisodes: undefined,
      }),
      [3, 4, 5],
    );

    assertEquals(
      inferCoveredEpisodeNumbers({
        explicitEpisodes: [],
        isBatch: true,
        missingEpisodes: [5, 6, 7],
        requestedEpisode: 5,
        totalEpisodes: undefined,
      }),
      [5, 6, 7],
    );

    assertEquals(
      inferCoveredEpisodeNumbers({
        explicitEpisodes: [],
        isBatch: true,
        missingEpisodes: [5, 6, 8, 9],
        requestedEpisode: 5,
        totalEpisodes: undefined,
      }),
      [5, 6],
    );

    assertEquals(
      inferCoveredEpisodeNumbers({
        explicitEpisodes: [],
        isBatch: false,
        missingEpisodes: [5, 6, 7],
        requestedEpisode: 5,
        totalEpisodes: undefined,
      }),
      [5],
    );

    assertEquals(
      inferCoveredEpisodeNumbers({
        explicitEpisodes: [],
        isBatch: true,
        missingEpisodes: [],
        requestedEpisode: 1,
        totalEpisodes: 12,
      }),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    );
  },
);

Deno.test("inferCoveredEpisodesFromTorrentContents parses real batch file lists", () => {
  assertEquals(
    inferCoveredEpisodesFromTorrentContents({
      files: [
        {
          index: 0,
          is_seed: false,
          name: "Season 01/Chainsaw Man - 01.mkv",
          priority: 1,
          progress: 1,
          size: 100,
        },
        {
          index: 1,
          is_seed: false,
          name: "Season 01/Chainsaw Man - 02.mkv",
          priority: 1,
          progress: 1,
          size: 100,
        },
        {
          index: 2,
          is_seed: false,
          name: "Season 01/NCOP.mkv",
          priority: 1,
          progress: 1,
          size: 100,
        },
      ],
      rootName: "Chainsaw Man",
    }),
    [1, 2],
  );
});

Deno.test("resolveReconciledBatchEpisodeNumbers falls back to covered episodes for lone generic files", () => {
  assertEquals(
    resolveReconciledBatchEpisodeNumbers({
      coveredEpisodes: [1, 2, 3],
      path: "/downloads/Show Season Pack.mkv",
      totalCandidateCount: 1,
    }),
    [1, 2, 3],
  );

  assertEquals(
    resolveReconciledBatchEpisodeNumbers({
      coveredEpisodes: [1, 2, 3],
      path: "/downloads/Show Season Pack.mkv",
      totalCandidateCount: 2,
    }),
    [],
  );
});

filesystemTest(
  "applyRemotePathMappings rewrites qBittorrent remote paths",
  () => {
    assertEquals(
      applyRemotePathMappings("/remote/downloads/show/episode.mkv", [[
        "/remote/downloads",
        "/local/downloads",
      ]]),
      ["/local/downloads/show/episode.mkv"],
    );
  },
);

filesystemTest(
  "covered episode serialization round-trips optional values",
  () => {
    assertEquals(toCoveredEpisodesJson([1, 2, 3]), "[1,2,3]");
    assertEquals(parseCoveredEpisodes("[1,2,3]"), [1, 2, 3]);
    assertEquals(toCoveredEpisodesJson([]), null);
    assertEquals(parseCoveredEpisodes(null), []);
  },
);

filesystemTest(
  "applyRemotePathMappings returns multiple matching candidates and skips invalid mappings",
  () => {
    assertEquals(
      applyRemotePathMappings("/remote/downloads/show/episode.mkv", [
        ["", "/ignored"],
        ["/different", "/ignored"],
        ["/remote", "/mnt/remote"],
        ["/remote/downloads", "/data/downloads"],
      ]),
      [
        "/mnt/remote/downloads/show/episode.mkv",
        "/data/downloads/show/episode.mkv",
      ],
    );
  },
);

filesystemTest(
  "resolveAccessibleDownloadPath uses mapped local paths when remote path is unavailable",
  async () => {
    await withFileSystemSandbox(async ({ fs, root }) => {
      const localRoot = `${root}/local`;
      await runTestEffect(fs.mkdir(`${localRoot}/show`, { recursive: true }));
      const localFile = `${localRoot}/show/episode.mkv`;
      await runTestEffect(writeTextFile(fs, localFile, "video"));

      assertEquals(
        await runTestEffect(
          resolveAccessibleDownloadPath(
            fs,
            "/remote/downloads/show/episode.mkv",
            [["/remote/downloads", localRoot]],
          ),
        ),
        localFile,
      );
    });
  },
);
