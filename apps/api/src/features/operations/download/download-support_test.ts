import { Cause, Effect, Exit, Layer } from "effect";
import { assert, it } from "@effect/vitest";

import { media } from "@/db/schema.ts";
import {
  FileSystem,
  FileSystemError,
  type FileSystemShape,
} from "@/infra/filesystem/filesystem.ts";
import {
  LibraryNaming,
  makeLibraryNaming,
  toLibraryNamingMedia,
} from "@/features/operations/library/library-naming.ts";
import { MediaProbe, MediaProbeNoMetadata } from "@/infra/media/probe.ts";
import { RandomService } from "@/infra/random.ts";
import {
  makeNoopTestFileSystemWithOverridesEffect,
  readTextFile,
  withFileSystemSandboxEffect,
  writeTextFile,
} from "@/test/filesystem-test.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";

import { ImportFileError } from "@/features/operations/download/download-file-import-errors.ts";

function makeNamingShapeEffect(fs: FileSystemShape) {
  const layer = Layer.effect(LibraryNaming, makeLibraryNaming()).pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(FileSystem, FileSystem.of(fs)),
        Layer.succeed(
          MediaProbe,
          MediaProbe.of({
            probeVideoFile: (_path: string) => Effect.succeed(new MediaProbeNoMetadata()),
          }),
        ),
        Layer.succeed(
          RandomService,
          RandomService.of({
            randomBytes: () => Effect.sync(() => new Uint8Array(16)),
            randomUuid: Effect.succeed("test-uuid-0000"),
          }),
        ),
      ),
    ),
  );
  return LibraryNaming.pipe(Effect.provide(layer));
}

function shouldReconcileCompletedDownloads(config: ReturnType<typeof makeTestConfig> | null) {
  return config?.downloads.reconcile_completed_downloads ?? true;
}

function shouldRemoveTorrentOnImport(config: ReturnType<typeof makeTestConfig> | null | undefined) {
  return config?.downloads.remove_torrent_on_import ?? true;
}

function shouldDeleteImportedData(config: ReturnType<typeof makeTestConfig> | null | undefined) {
  return config?.downloads.delete_download_files_after_import ?? false;
}

function makeMediaRow(overrides: Partial<typeof media.$inferSelect>): typeof media.$inferSelect {
  return {
    addedAt: "2024-01-01T00:00:00.000Z",
    background: null,
    bannerImage: null,
    coverImage: null,
    description: null,
    duration: null,
    endDate: null,
    endYear: null,
    unitCount: 12,
    favorites: null,
    format: "TV",
    genres: "[]",
    id: 1,
    mediaKind: "anime",
    malId: null,
    members: null,
    monitored: true,
    nextAiringAt: null,
    nextAiringUnit: null,
    popularity: null,
    profileName: "Default",
    recommendedMedia: null,
    releaseProfileIds: "[]",
    relatedMedia: null,
    rootFolder: "/library/Media",
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
    titleRomaji: "Media",
    ...overrides,
  };
}

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

it.effect("placeFile keeps existing destination when staging copy fails", () =>
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

      const naming = yield* makeNamingShapeEffect(failingFs);
      const exit = yield* Effect.exit(
        naming.placeFile(
          {
            media: toLibraryNamingMedia(
              makeMediaRow({
                rootFolder: animeRoot,
                titleRomaji: "Naruto",
              }),
            ),
            unitNumbers: [1],
            sourcePath,
          },
          { importMode: "copy" },
        ),
      );

      assert.deepStrictEqual(exit._tag, "Failure");
      const destinationContents = yield* readTextFile(fs, destinationPath);
      assert.deepStrictEqual(destinationContents, "existing");
    }),
  ),
);

it.effect("placeFile surfaces stat access errors instead of treating as missing", () =>
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

      const naming = yield* makeNamingShapeEffect(accessErrorFs);
      const exit = yield* Effect.exit(
        naming.placeFile(
          {
            media: toLibraryNamingMedia(
              makeMediaRow({
                rootFolder: animeRoot,
                titleRomaji: "Naruto",
              }),
            ),
            unitNumbers: [1],
            sourcePath,
          },
          { importMode: "copy" },
        ),
      );

      assert.deepStrictEqual(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.findErrorOption(exit.cause);
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

it.effect("placeFile cleans staged temp file when backup rename fails", () =>
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

      const naming = yield* makeNamingShapeEffect(failingBackupFs);
      const exit = yield* Effect.exit(
        naming.placeFile(
          {
            media: toLibraryNamingMedia(
              makeMediaRow({
                rootFolder: animeRoot,
                titleRomaji: "Naruto",
              }),
            ),
            unitNumbers: [1],
            sourcePath,
          },
          { importMode: "copy" },
        ),
      );

      assert.deepStrictEqual(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.findErrorOption(exit.cause);
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

it.effect("placeFile returns composed failure when restore also fails", () =>
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

      const naming = yield* makeNamingShapeEffect(restoreFailureFs);
      const exit = yield* Effect.exit(
        naming.placeFile(
          {
            media: toLibraryNamingMedia(
              makeMediaRow({
                rootFolder: animeRoot,
                titleRomaji: "Naruto",
              }),
            ),
            unitNumbers: [1],
            sourcePath,
          },
          { importMode: "copy" },
        ),
      );

      assert.deepStrictEqual(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.findErrorOption(exit.cause);
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

it.effect("placeFile fails when cross-filesystem move cannot delete the source file", () =>
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

      const naming = yield* makeNamingShapeEffect(crossFilesystemFs);
      const exit = yield* Effect.exit(
        naming.placeFile(
          {
            media: toLibraryNamingMedia(
              makeMediaRow({
                rootFolder: animeRoot,
                titleRomaji: "Naruto",
              }),
            ),
            unitNumbers: [1],
            sourcePath,
          },
          { importMode: "move" },
        ),
      );

      assert.deepStrictEqual(Exit.isFailure(exit), true);
      assert.deepStrictEqual(yield* readTextFile(fs, sourcePath), "incoming");
      if (Exit.isFailure(exit)) {
        const failure = Cause.findErrorOption(exit.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value instanceof ImportFileError, true);
          assert.deepStrictEqual(failure.value.message, "Failed to move file to temp destination");
        }
      }
    }),
  ),
);

it.effect("placeFile applies configured naming tokens from source filename metadata", () => {
  const namingFormat =
    "{title} - S{season:02}E{episode:02} - {unit_title} [{quality} {resolution}][{video_codec}][{audio_codec} {audio_channels}][{group}]";

  return withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/Rock Is a Lady's Modesty (2025) - S01E01 - Good Day to You Quit Playing the Guitar!!! [v2 WEBDL-1080p Proper][AAC 2.0][AVC][SubsPlus+].mkv`;
      const expectedDestination = `${animeRoot}/Rock Is a Lady's Modesty - S01E01 - Good Day to You Quit Playing the Guitar!!! [WEB-DL 1080p][AVC][AAC 2.0][SubsPlus+].mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const naming = yield* makeNamingShapeEffect(fs);
      const placed = yield* naming.placeFile(
        {
          media: toLibraryNamingMedia(
            makeMediaRow({
              rootFolder: animeRoot,
              startDate: "2025-04-03",
              startYear: 2025,
              titleRomaji: "Rock Is a Lady's Modesty",
            }),
          ),
          unitNumbers: [1],
          sourcePath,
          namingFormat,
          preferredTitle: "romaji",
        },
        { importMode: "copy" },
      );
      const destination = placed.destination;

      assert.deepStrictEqual(destination, expectedDestination);
      assert.deepStrictEqual(yield* readTextFile(fs, destination), "incoming");
      assert.deepStrictEqual(yield* readTextFile(fs, sourcePath), "incoming");
    }),
  );
});

it.effect("placeFile respects preferred title when building destination", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/movie-source-file.mkv`;
      const expectedDestination = `${animeRoot}/Your Name. (2016).mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const naming = yield* makeNamingShapeEffect(fs);
      const placed = yield* naming.placeFile(
        {
          media: toLibraryNamingMedia(
            makeMediaRow({
              format: "MOVIE",
              rootFolder: animeRoot,
              startDate: "2016-08-26",
              startYear: 2016,
              titleEnglish: "Your Name.",
              titleNative: "君の名は。",
              titleRomaji: "Kimi no Na wa.",
            }),
          ),
          unitNumbers: [1],
          sourcePath,
          namingFormat: "{title} ({year})",
          preferredTitle: "english",
        },
        { importMode: "copy" },
      );
      const destination = placed.destination;

      assert.deepStrictEqual(destination, expectedDestination);
    }),
  ),
);

it.effect("placeFile uses episode DB metadata and fallback naming plan", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/Show - 01.mkv`;
      const expectedDestination = `${animeRoot}/Show - 01.mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const naming = yield* makeNamingShapeEffect(fs);
      const placed = yield* naming.placeFile(
        {
          episodeRows: [{ aired: "2025-03-14", title: "Pilot" }],
          media: toLibraryNamingMedia(
            makeMediaRow({
              format: "TV",
              rootFolder: animeRoot,
              startDate: "2025-01-01",
              startYear: 2025,
              titleRomaji: "Show",
            }),
          ),
          unitNumbers: [1],
          sourcePath,
          namingFormat: "{title} - S{season:02}E{episode:02}",
          preferredTitle: "romaji",
        },
        { importMode: "copy" },
      );
      const destination = placed.destination;

      assert.deepStrictEqual(destination, expectedDestination);
    }),
  ),
);

it.effect("placeFile reuses stored provenance when source path is weak", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/download.mkv`;
      const expectedDestination = `${animeRoot}/Show - 01 [WEB-DL 1080p].mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const naming = yield* makeNamingShapeEffect(fs);
      const placed = yield* naming.placeFile(
        {
          downloadSourceMetadata: {
            quality: "WEB-DL",
            resolution: "1080p",
            source_identity: {
              unit_numbers: [1],
              label: "01",
              scheme: "absolute",
            },
          },
          media: toLibraryNamingMedia(
            makeMediaRow({
              format: "TV",
              rootFolder: animeRoot,
              startDate: "2025-01-01",
              startYear: 2025,
              titleRomaji: "Show",
            }),
          ),
          unitNumbers: [1],
          sourcePath,
          namingFormat: "{title} - {source_episode_segment} [{quality} {resolution}]",
          preferredTitle: "romaji",
        },
        { importMode: "copy" },
      );
      const destination = placed.destination;

      assert.deepStrictEqual(destination, expectedDestination);
    }),
  ),
);

it.effect("placeFile uses local media metadata when heuristics are missing", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/download.mkv`;
      const expectedDestination = `${animeRoot}/Show - 01 [1080p][HEVC][AAC 2.0].mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const naming = yield* makeNamingShapeEffect(fs);
      const placed = yield* naming.placeFile(
        {
          localMediaMetadata: {
            audio_channels: "2.0",
            audio_codec: "AAC",
            resolution: "1080p",
            video_codec: "HEVC",
          },
          media: toLibraryNamingMedia(
            makeMediaRow({
              format: "TV",
              rootFolder: animeRoot,
              startDate: "2025-01-01",
              startYear: 2025,
              titleRomaji: "Show",
            }),
          ),
          unitNumbers: [1],
          sourcePath,
          namingFormat:
            "{title} - {source_episode_segment} [{resolution}][{video_codec}][{audio_codec} {audio_channels}]",
          preferredTitle: "romaji",
        },
        { importMode: "copy" },
      );
      const destination = placed.destination;

      assert.deepStrictEqual(destination, expectedDestination);
    }),
  ),
);

const makeImportRoots = Effect.fn("Test.makeImportRoots")(function* (
  fs: FileSystemShape,
  root: string,
) {
  const animeRoot = `${root}/media`;
  const sourceRoot = `${root}/source`;
  yield* fs.mkdir(animeRoot, { recursive: true });
  yield* fs.mkdir(sourceRoot, { recursive: true });
  return { animeRoot, sourceRoot };
});

function makeFsError(path: string, code: string, message: string) {
  const cause = Object.assign(new Error(message), { code });

  return new FileSystemError({
    cause,
    message,
    path,
  });
}
