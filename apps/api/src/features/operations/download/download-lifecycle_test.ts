import { assert, it } from "@effect/vitest";

import {
  applyRemotePathMappings,
  parseMagnetInfoHash,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
} from "@/features/operations/download/download-paths.ts";
import {
  inferCoveredEpisodeNumbers,
  inferCoveredEpisodesFromTorrentContents,
  parseCoveredEpisodesEffect,
  resolveReconciledBatchEpisodeNumbers,
  toCoveredEpisodesJson,
} from "@/features/operations/download/download-coverage.ts";
import { Cause, Effect, Exit, Option } from "effect";
import { withFileSystemSandboxEffect, writeTextFile } from "@/test/filesystem-test.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";

it("parseMagnetInfoHash extracts btih from magnet links", () => {
  assert.deepStrictEqual(
    parseMagnetInfoHash("magnet:?xt=urn:btih:ABCDEF1234567890&dn=Example"),
    Option.some("abcdef1234567890"),
  );
  assert.deepStrictEqual(parseMagnetInfoHash(undefined), Option.none());
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

      assert.deepStrictEqual(yield* resolveCompletedContentPath(fs, dir, 2), Option.some(second));
      assert.deepStrictEqual(yield* resolveCompletedContentPath(fs, first, 1), Option.some(first));
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

      assert.deepStrictEqual(
        yield* resolveCompletedContentPath(fs, dir, 1, {
          expectedAirDate: "2025-03-21",
        }),
        Option.some(second),
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

      assert.deepStrictEqual(yield* resolveCompletedContentPath(fs, dir, 7), Option.some(file));
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

      assert.deepStrictEqual(yield* resolveBatchContentPaths(fs, dir), [first, second]);
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

        assert.deepStrictEqual(yield* resolveBatchContentPaths(fs, file), [file]);
      }),
    ),
);

it("inferCoveredEpisodeNumbers prefers explicit ranges and falls back to missing tails for batches", () => {
  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [3, 4, 5],
      isBatch: true,
      missingUnits: [3, 4, 5, 6],
      requestedEpisode: 3,
    }),
    [3, 4, 5],
  );

  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [],
      isBatch: true,
      missingUnits: [5, 6, 7],
      requestedEpisode: 5,
    }),
    [5, 6, 7],
  );

  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [],
      isBatch: true,
      missingUnits: [5, 6, 8, 9],
      requestedEpisode: 5,
    }),
    [5, 6],
  );

  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [],
      isBatch: false,
      missingUnits: [5, 6, 7],
      requestedEpisode: 5,
    }),
    [5],
  );

  assert.deepStrictEqual(
    inferCoveredEpisodeNumbers({
      explicitEpisodes: [],
      isBatch: true,
      missingUnits: [],
      requestedEpisode: 1,
      totalUnits: 12,
    }),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
});

it("inferCoveredEpisodesFromTorrentContents parses real batch file lists", () => {
  assert.deepStrictEqual(
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

it("resolveReconciledBatchEpisodeNumbers falls back to covered mediaUnits for lone generic files", () => {
  assert.deepStrictEqual(
    resolveReconciledBatchEpisodeNumbers({
      coveredUnits: [1, 2, 3],
      path: "/downloads/Show Season Pack.mkv",
      totalCandidateCount: 1,
    }),
    [1, 2, 3],
  );

  assert.deepStrictEqual(
    resolveReconciledBatchEpisodeNumbers({
      coveredUnits: [1, 2, 3],
      path: "/downloads/Show Season Pack.mkv",
      totalCandidateCount: 2,
    }),
    [],
  );
});

it("applyRemotePathMappings rewrites qBittorrent remote paths", () => {
  assert.deepStrictEqual(
    applyRemotePathMappings("/remote/downloads/show/episode.mkv", [
      ["/remote/downloads", "/local/downloads"],
    ]),
    ["/local/downloads/show/episode.mkv"],
  );
});

it.effect(
  "covered episode serialization round-trips optional values and rejects corrupt data",
  () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* toCoveredEpisodesJson([1, 2, 3]), "[1,2,3]");
      assert.deepStrictEqual(yield* parseCoveredEpisodesEffect("[1,2,3]"), [1, 2, 3]);
      assert.deepStrictEqual(yield* toCoveredEpisodesJson([]), null);
      assert.deepStrictEqual(yield* parseCoveredEpisodesEffect(null), []);

      const exit = yield* Effect.exit(parseCoveredEpisodesEffect("not-json"));
      assert.deepStrictEqual(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value instanceof OperationsStoredDataError, true);
        }
      }
    }),
);

it("applyRemotePathMappings returns multiple matching candidates and skips invalid mappings", () => {
  assert.deepStrictEqual(
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

        assert.deepStrictEqual(
          yield* resolveAccessibleDownloadPath(fs, "/remote/downloads/show/episode.mkv", [
            ["/remote/downloads", localRoot],
          ]),
          Option.some(localFile),
        );
      }),
    ),
);
