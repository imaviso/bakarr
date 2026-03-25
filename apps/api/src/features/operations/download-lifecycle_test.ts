import { assertEquals, it } from "../../test/vitest.ts";

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
import { Effect } from "effect";
import { withFileSystemSandboxEffect, writeTextFile } from "../../test/filesystem-test.ts";

it("parseMagnetInfoHash extracts btih from magnet links", () => {
  assertEquals(
    parseMagnetInfoHash("magnet:?xt=urn:btih:ABCDEF1234567890&dn=Example"),
    "abcdef1234567890",
  );
  assertEquals(parseMagnetInfoHash(undefined), undefined);
});

it.scoped("resolveCompletedContentPath prefers matching episode files inside directories", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const dir = `${root}/completed`;
      yield* fs.mkdir(dir, { recursive: true });
      const first = `${dir}/Show - 01.mkv`;
      const second = `${dir}/Show - 02.mkv`;
      yield* writeTextFile(fs, first, "one");
      yield* writeTextFile(fs, second, "two");

      assertEquals(yield* resolveCompletedContentPath(fs, dir, 2), second);
      assertEquals(yield* resolveCompletedContentPath(fs, first, 1), first);
    }),
  ),
);

it.scoped("resolveCompletedContentPath matches daily files by expected air date", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const dir = `${root}/daily`;
      yield* fs.mkdir(dir, { recursive: true });
      const first = `${dir}/Show - 2025-03-14.mkv`;
      const second = `${dir}/Show - 2025-03-21.mkv`;
      yield* writeTextFile(fs, first, "one");
      yield* writeTextFile(fs, second, "two");

      assertEquals(
        yield* resolveCompletedContentPath(fs, dir, 1, {
          expectedAirDate: "2025-03-21",
        }),
        second,
      );
    }),
  ),
);

it.scoped("resolveCompletedContentPath falls back to a lone generic video file", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const dir = `${root}/generic`;
      yield* fs.mkdir(dir, { recursive: true });
      const file = `${dir}/download.mkv`;
      yield* writeTextFile(fs, file, "video");

      assertEquals(yield* resolveCompletedContentPath(fs, dir, 7), file);
    }),
  ),
);

it.scoped("resolveBatchContentPaths collects video files from completed batch directories", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const dir = `${root}/batch-dir`;
      yield* fs.mkdir(dir, { recursive: true });
      const first = `${dir}/Show - 01.mkv`;
      const second = `${dir}/Show - 02.mp4`;
      const ignored = `${dir}/note.txt`;
      yield* writeTextFile(fs, first, "one");
      yield* writeTextFile(fs, second, "two");
      yield* writeTextFile(fs, ignored, "ignore");

      assertEquals(yield* resolveBatchContentPaths(fs, dir), [first, second]);
    }),
  ),
);

it.scoped(
  "resolveBatchContentPaths returns a single file for batch torrents stored as one file",
  () =>
    withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const file = `${root}/Show Season Pack.mkv`;
        yield* writeTextFile(fs, file, "season");

        assertEquals(yield* resolveBatchContentPaths(fs, file), [file]);
      }),
    ),
);

it("inferCoveredEpisodeNumbers prefers explicit ranges and falls back to missing tails for batches", () => {
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
});

it("inferCoveredEpisodesFromTorrentContents parses real batch file lists", () => {
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

it("resolveReconciledBatchEpisodeNumbers falls back to covered episodes for lone generic files", () => {
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

it("applyRemotePathMappings rewrites qBittorrent remote paths", () => {
  assertEquals(
    applyRemotePathMappings("/remote/downloads/show/episode.mkv", [
      ["/remote/downloads", "/local/downloads"],
    ]),
    ["/local/downloads/show/episode.mkv"],
  );
});

it("covered episode serialization round-trips optional values", () => {
  assertEquals(toCoveredEpisodesJson([1, 2, 3]), "[1,2,3]");
  assertEquals(parseCoveredEpisodes("[1,2,3]"), [1, 2, 3]);
  assertEquals(toCoveredEpisodesJson([]), null);
  assertEquals(parseCoveredEpisodes(null), []);
});

it("applyRemotePathMappings returns multiple matching candidates and skips invalid mappings", () => {
  assertEquals(
    applyRemotePathMappings("/remote/downloads/show/episode.mkv", [
      ["", "/ignored"],
      ["/different", "/ignored"],
      ["/remote", "/mnt/remote"],
      ["/remote/downloads", "/data/downloads"],
    ]),
    ["/mnt/remote/downloads/show/episode.mkv", "/data/downloads/show/episode.mkv"],
  );
});

it.scoped(
  "resolveAccessibleDownloadPath uses mapped local paths when remote path is unavailable",
  () =>
    withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const localRoot = `${root}/local`;
        yield* fs.mkdir(`${localRoot}/show`, { recursive: true });
        const localFile = `${localRoot}/show/episode.mkv`;
        yield* writeTextFile(fs, localFile, "video");

        assertEquals(
          yield* resolveAccessibleDownloadPath(fs, "/remote/downloads/show/episode.mkv", [
            ["/remote/downloads", localRoot],
          ]),
          localFile,
        );
      }),
    ),
);
