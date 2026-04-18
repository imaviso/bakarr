import { assert, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";

import { anime } from "@/db/schema.ts";
import { FileSystemError, type FileSystemShape } from "@/lib/filesystem.ts";
import {
  makeNoopTestFileSystemWithOverridesEffect,
  readTextFile,
  withFileSystemSandboxEffect,
  writeTextFile,
} from "@/test/filesystem-test.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import {
  importDownloadedFile,
  ImportFileError,
  shouldDeleteImportedData,
  shouldReconcileCompletedDownloads,
  shouldRemoveTorrentOnImport,
} from "@/features/operations/download-support.ts";

function makeAnimeRow(overrides: Partial<typeof anime.$inferSelect>): typeof anime.$inferSelect {
  return {
    addedAt: "2024-01-01T00:00:00.000Z",
    background: null,
    bannerImage: null,
    coverImage: null,
    description: null,
    duration: null,
    endDate: null,
    endYear: null,
    episodeCount: 12,
    favorites: null,
    format: "TV",
    genres: "[]",
    id: 1,
    malId: null,
    members: null,
    monitored: true,
    nextAiringAt: null,
    nextAiringEpisode: null,
    popularity: null,
    profileName: "Default",
    recommendedAnime: null,
    releaseProfileIds: "[]",
    relatedAnime: null,
    rootFolder: "/library/Anime",
    rank: null,
    rating: null,
    score: null,
    source: null,
    startDate: null,
    startYear: null,
    status: "RELEASING",
    studios: "[]",
    synonyms: null,
    titleEnglish: null,
    titleNative: null,
    titleRomaji: "Anime",
    ...overrides,
  };
}

const testRandomUuid = () => Effect.succeed("test-uuid-0000");

it("download support helpers use config values and defaults", () => {
  const config = makeTestConfig("./test.sqlite", (c) => ({
    ...c,
    downloads: {
      ...c.downloads,
      delete_download_files_after_import: true,
      reconcile_completed_downloads: false,
      remove_torrent_on_import: false,
    },
  }));

  assert.deepStrictEqual(shouldReconcileCompletedDownloads(config), false);
  assert.deepStrictEqual(shouldRemoveTorrentOnImport(config), false);
  assert.deepStrictEqual(shouldDeleteImportedData(config), true);

  assert.deepStrictEqual(shouldReconcileCompletedDownloads(null), true);
  assert.deepStrictEqual(shouldRemoveTorrentOnImport(undefined), true);
  assert.deepStrictEqual(shouldDeleteImportedData(undefined), false);
});

it.scoped("importDownloadedFile keeps existing destination when staging copy fails", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/Naruto - 01.mkv`;
      const destinationPath = `${animeRoot}/Naruto - 01.mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");
      yield* writeTextFile(fs, destinationPath, "existing");

      const failingFs = yield* makeNoopTestFileSystemWithOverridesEffect({
        ...fs,
        copyFile: (from) =>
          Effect.fail(
            new FileSystemError({
              cause: new Error("copy failed"),
              message: "Failed to copy file",
              path: from,
            }),
          ),
      });

      const exit = yield* Effect.exit(
        importDownloadedFile(
          failingFs,
          makeAnimeRow({
            rootFolder: animeRoot,
            titleRomaji: "Naruto",
          }),
          1,
          sourcePath,
          "copy",
          { randomUuid: testRandomUuid },
        ),
      );

      assert.deepStrictEqual(exit._tag, "Failure");
      const destinationContents = yield* readTextFile(fs, destinationPath);
      assert.deepStrictEqual(destinationContents, "existing");
    }),
  ),
);

it.scoped("importDownloadedFile surfaces stat access errors instead of treating as missing", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/Naruto - 01.mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const accessErrorFs = yield* makeNoopTestFileSystemWithOverridesEffect({
        ...fs,
        stat: (path) =>
          path.toString().includes("Naruto - 01")
            ? Effect.fail(makeFsError(path.toString(), "EACCES", "permission denied"))
            : fs.stat(path),
      });

      const exit = yield* Effect.exit(
        importDownloadedFile(
          accessErrorFs,
          makeAnimeRow({
            rootFolder: animeRoot,
            titleRomaji: "Naruto",
          }),
          1,
          sourcePath,
          "copy",
          { randomUuid: testRandomUuid },
        ),
      );

      assert.deepStrictEqual(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value instanceof ImportFileError, true);
          assert.deepStrictEqual(
            failure.value.message,
            "Failed to determine destination file existence",
          );
        }
      }
    }),
  ),
);

it.scoped("importDownloadedFile cleans staged temp file when backup rename fails", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/Naruto - 01.mkv`;
      const destinationPath = `${animeRoot}/Naruto - 01.mkv`;
      const tempPath = `${destinationPath}.tmp.test-uuid-0000`;

      yield* writeTextFile(fs, sourcePath, "incoming");
      yield* writeTextFile(fs, destinationPath, "existing");

      const failingBackupFs = yield* makeNoopTestFileSystemWithOverridesEffect({
        ...fs,
        rename: (from, to) =>
          from === destinationPath && to.includes(".bak.")
            ? Effect.fail(makeFsError(from, "EACCES", "permission denied"))
            : fs.rename(from, to),
      });

      const exit = yield* Effect.exit(
        importDownloadedFile(
          failingBackupFs,
          makeAnimeRow({
            rootFolder: animeRoot,
            titleRomaji: "Naruto",
          }),
          1,
          sourcePath,
          "copy",
          { randomUuid: testRandomUuid },
        ),
      );

      assert.deepStrictEqual(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value instanceof ImportFileError, true);
          assert.deepStrictEqual(failure.value.message, "Failed to back up existing destination");
        }
      }

      const tempStat = yield* Effect.exit(fs.stat(tempPath));
      assert.deepStrictEqual(Exit.isFailure(tempStat), true);
      assert.deepStrictEqual(yield* readTextFile(fs, destinationPath), "existing");
      assert.deepStrictEqual(yield* readTextFile(fs, sourcePath), "incoming");
    }),
  ),
);

it.scoped("importDownloadedFile returns composed failure when restore also fails", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/Naruto - 01.mkv`;
      const destinationPath = `${animeRoot}/Naruto - 01.mkv`;
      const tempPath = `${destinationPath}.tmp.test-uuid-0000`;
      const backupPath = `${destinationPath}.bak.test-uuid-0000`;

      yield* writeTextFile(fs, sourcePath, "incoming");
      yield* writeTextFile(fs, destinationPath, "existing");

      const restoreFailureFs = yield* makeNoopTestFileSystemWithOverridesEffect({
        ...fs,
        rename: (from, to) => {
          if (from === tempPath && to === destinationPath) {
            return Effect.fail(makeFsError(from, "ENOSPC", "disk full"));
          }

          if (from === backupPath && to === destinationPath) {
            return Effect.fail(makeFsError(from, "EACCES", "permission denied"));
          }

          return fs.rename(from, to);
        },
      });

      const exit = yield* Effect.exit(
        importDownloadedFile(
          restoreFailureFs,
          makeAnimeRow({
            rootFolder: animeRoot,
            titleRomaji: "Naruto",
          }),
          1,
          sourcePath,
          "copy",
          { randomUuid: testRandomUuid },
        ),
      );

      assert.deepStrictEqual(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value instanceof ImportFileError, true);
          assert.deepStrictEqual(
            failure.value.message,
            "Failed to rename temp file to destination and restore backup",
          );
        }
      }

      const tempStat = yield* Effect.exit(fs.stat(tempPath));
      assert.deepStrictEqual(Exit.isFailure(tempStat), true);
      assert.deepStrictEqual(yield* readTextFile(fs, backupPath), "existing");
      assert.deepStrictEqual(yield* readTextFile(fs, sourcePath), "incoming");
    }),
  ),
);

it.scoped(
  "importDownloadedFile fails when cross-filesystem move cannot delete the source file",
  () =>
    withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
        const sourcePath = `${sourceRoot}/Naruto - 01.mkv`;

        yield* writeTextFile(fs, sourcePath, "incoming");

        const crossFilesystemFs = yield* makeNoopTestFileSystemWithOverridesEffect({
          ...fs,
          rename: (from, to) =>
            from === sourcePath
              ? Effect.fail(makeFsError(from, "EXDEV", "cross-device rename blocked"))
              : fs.rename(from, to),
          remove: (path, options) =>
            path === sourcePath
              ? Effect.fail(makeFsError(path, "EACCES", "permission denied"))
              : fs.remove(path, options),
        });

        const exit = yield* Effect.exit(
          importDownloadedFile(
            crossFilesystemFs,
            makeAnimeRow({
              rootFolder: animeRoot,
              titleRomaji: "Naruto",
            }),
            1,
            sourcePath,
            "move",
            { randomUuid: testRandomUuid },
          ),
        );

        assert.deepStrictEqual(Exit.isFailure(exit), true);
        assert.deepStrictEqual(yield* readTextFile(fs, sourcePath), "incoming");
        if (Exit.isFailure(exit)) {
          const failure = Cause.failureOption(exit.cause);
          assert.deepStrictEqual(failure._tag, "Some");
          if (failure._tag === "Some") {
            assert.deepStrictEqual(failure.value instanceof ImportFileError, true);
            assert.deepStrictEqual(
              failure.value.message,
              "Failed to move file to temp destination",
            );
          }
        }
      }),
    ),
);

it.scoped(
  "importDownloadedFile applies configured naming tokens from source filename metadata",
  () => {
    const namingFormat =
      "{title} - S{season:02}E{episode:02} - {episode_title} [{quality} {resolution}][{video_codec}][{audio_codec} {audio_channels}][{group}]";

    return withFileSystemSandboxEffect(({ fs, root }) =>
      Effect.gen(function* () {
        const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
        const sourcePath = `${sourceRoot}/Rock Is a Lady's Modesty (2025) - S01E01 - Good Day to You Quit Playing the Guitar!!! [v2 WEBDL-1080p Proper][AAC 2.0][AVC][SubsPlus+].mkv`;
        const expectedDestination = `${animeRoot}/Rock Is a Lady's Modesty - S01E01 - Good Day to You Quit Playing the Guitar!!! [WEB-DL 1080p][AVC][AAC 2.0][SubsPlus+].mkv`;

        yield* writeTextFile(fs, sourcePath, "incoming");

        const destination = yield* importDownloadedFile(
          fs,
          makeAnimeRow({
            rootFolder: animeRoot,
            startDate: "2025-04-03",
            startYear: 2025,
            titleRomaji: "Rock Is a Lady's Modesty",
          }),
          1,
          sourcePath,
          "copy",
          { namingFormat, randomUuid: testRandomUuid },
        );

        assert.deepStrictEqual(destination, expectedDestination);
        assert.deepStrictEqual(yield* readTextFile(fs, destination), "incoming");
        assert.deepStrictEqual(yield* readTextFile(fs, sourcePath), "incoming");
      }),
    );
  },
);

it.scoped("importDownloadedFile respects preferred title when building destination", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/movie-source-file.mkv`;
      const expectedDestination = `${animeRoot}/Your Name. (2016).mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const destination = yield* importDownloadedFile(
        fs,
        makeAnimeRow({
          format: "MOVIE",
          rootFolder: animeRoot,
          startDate: "2016-08-26",
          startYear: 2016,
          titleEnglish: "Your Name.",
          titleNative: "君の名は。",
          titleRomaji: "Kimi no Na wa.",
        }),
        1,
        sourcePath,
        "copy",
        {
          namingFormat: "{title} ({year})",
          preferredTitle: "english",
          randomUuid: testRandomUuid,
        },
      );

      assert.deepStrictEqual(destination, expectedDestination);
    }),
  ),
);

it.scoped("importDownloadedFile uses episode DB metadata and fallback naming plan", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/Show - 01.mkv`;
      const expectedDestination = `${animeRoot}/Show - 01.mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const destination = yield* importDownloadedFile(
        fs,
        makeAnimeRow({
          format: "TV",
          rootFolder: animeRoot,
          startDate: "2025-01-01",
          startYear: 2025,
          titleRomaji: "Show",
        }),
        1,
        sourcePath,
        "copy",
        {
          episodeRows: [{ aired: "2025-03-14", title: "Pilot" }],
          namingFormat: "{title} - S{season:02}E{episode:02}",
          preferredTitle: "romaji",
          randomUuid: testRandomUuid,
        },
      );

      assert.deepStrictEqual(destination, expectedDestination);
    }),
  ),
);

it.scoped("importDownloadedFile reuses stored provenance when source path is weak", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/download.mkv`;
      const expectedDestination = `${animeRoot}/Show - 01 [WEB-DL 1080p].mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const destination = yield* importDownloadedFile(
        fs,
        makeAnimeRow({
          format: "TV",
          rootFolder: animeRoot,
          startDate: "2025-01-01",
          startYear: 2025,
          titleRomaji: "Show",
        }),
        1,
        sourcePath,
        "copy",
        {
          downloadSourceMetadata: {
            quality: "WEB-DL",
            resolution: "1080p",
            source_identity: {
              episode_numbers: [1],
              label: "01",
              scheme: "absolute",
            },
          },
          namingFormat: "{title} - {source_episode_segment} [{quality} {resolution}]",
          preferredTitle: "romaji",
          randomUuid: testRandomUuid,
        },
      );

      assert.deepStrictEqual(destination, expectedDestination);
    }),
  ),
);

it.scoped("importDownloadedFile uses local media metadata when heuristics are missing", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/download.mkv`;
      const expectedDestination = `${animeRoot}/Show - 01 [1080p][HEVC][AAC 2.0].mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const destination = yield* importDownloadedFile(
        fs,
        makeAnimeRow({
          format: "TV",
          rootFolder: animeRoot,
          startDate: "2025-01-01",
          startYear: 2025,
          titleRomaji: "Show",
        }),
        1,
        sourcePath,
        "copy",
        {
          localMediaMetadata: {
            audio_channels: "2.0",
            audio_codec: "AAC",
            resolution: "1080p",
            video_codec: "HEVC",
          },
          namingFormat:
            "{title} - {source_episode_segment} [{resolution}][{video_codec}][{audio_codec} {audio_channels}]",
          preferredTitle: "romaji",
          randomUuid: testRandomUuid,
        },
      );

      assert.deepStrictEqual(destination, expectedDestination);
    }),
  ),
);

const makeImportRoots = Effect.fn("Test.makeImportRoots")(function* (
  fs: FileSystemShape,
  root: string,
) {
  const animeRoot = `${root}/anime`;
  const sourceRoot = `${root}/source`;
  yield* fs.mkdir(animeRoot, { recursive: true });
  yield* fs.mkdir(sourceRoot, { recursive: true });
  return { animeRoot, sourceRoot };
});

function makeFsError(path: string, code: string, message: string) {
  const cause = new Error(message) as Error & { code?: string };
  cause.code = code;

  return new FileSystemError({
    cause,
    message,
    path,
  });
}
