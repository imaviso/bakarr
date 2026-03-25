import { assertEquals, it } from "../../test/vitest.ts";
import { Effect } from "effect";

import { anime } from "../../db/schema.ts";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import {
  makeNoopTestFileSystemWithOverridesEffect,
  readTextFile,
  withFileSystemSandboxEffect,
  writeTextFile,
} from "../../test/filesystem-test.ts";
import { makeDefaultConfig } from "../system/defaults.ts";
import {
  importDownloadedFile,
  shouldDeleteImportedData,
  shouldReconcileCompletedDownloads,
  shouldRemoveTorrentOnImport,
} from "./download-support.ts";

it("download support helpers use config values and defaults", () => {
  const config = {
    profiles: [],
    ...makeDefaultConfig("./test.sqlite"),
    downloads: {
      ...makeDefaultConfig("./test.sqlite").downloads,
      delete_download_files_after_import: true,
      reconcile_completed_downloads: false,
      remove_torrent_on_import: false,
    },
  };

  assertEquals(shouldReconcileCompletedDownloads(config), false);
  assertEquals(shouldRemoveTorrentOnImport(config), false);
  assertEquals(shouldDeleteImportedData(config), true);

  assertEquals(shouldReconcileCompletedDownloads(null), true);
  assertEquals(shouldRemoveTorrentOnImport(undefined), true);
  assertEquals(shouldDeleteImportedData(undefined), false);
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
          {
            rootFolder: animeRoot,
            titleRomaji: "Naruto",
          } as typeof anime.$inferSelect,
          1,
          sourcePath,
          "copy",
        ),
      );

      assertEquals(exit._tag, "Failure");
      const destinationContents = yield* readTextFile(fs, destinationPath);
      assertEquals(destinationContents, "existing");
    }),
  )
);

it.scoped("importDownloadedFile applies configured naming tokens from source filename metadata", () => {
  const namingFormat =
    "{title} - S{season:02}E{episode:02} - {episode_title} [{quality} {resolution}][{video_codec}][{audio_codec} {audio_channels}][{group}]";

  return withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath =
        `${sourceRoot}/Rock Is a Lady's Modesty (2025) - S01E01 - Good Day to You Quit Playing the Guitar!!! [v2 WEBDL-1080p Proper][AAC 2.0][AVC][SubsPlus+].mkv`;
      const expectedDestination =
        `${animeRoot}/Rock Is a Lady's Modesty - S01E01 - Good Day to You Quit Playing the Guitar!!! [WEB-DL 1080p][AVC][AAC 2.0][SubsPlus+].mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const destination = yield* importDownloadedFile(
        fs,
        {
          rootFolder: animeRoot,
          startDate: "2025-04-03",
          startYear: 2025,
          titleRomaji: "Rock Is a Lady's Modesty",
        } as typeof anime.$inferSelect,
        1,
        sourcePath,
        "copy",
        { namingFormat },
      );

      assertEquals(destination, expectedDestination);
      assertEquals(yield* readTextFile(fs, destination), "incoming");
      assertEquals(yield* readTextFile(fs, sourcePath), "incoming");
    }),
  );
});

it.scoped("importDownloadedFile respects preferred title when building destination", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/movie-source-file.mkv`;
      const expectedDestination = `${animeRoot}/Your Name. (2016).mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const destination = yield* importDownloadedFile(
        fs,
        {
          format: "MOVIE",
          rootFolder: animeRoot,
          startDate: "2016-08-26",
          startYear: 2016,
          titleEnglish: "Your Name.",
          titleNative: "君の名は。",
          titleRomaji: "Kimi no Na wa.",
        } as typeof anime.$inferSelect,
        1,
        sourcePath,
        "copy",
        {
          namingFormat: "{title} ({year})",
          preferredTitle: "english",
        },
      );

      assertEquals(destination, expectedDestination);
    }),
  )
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
        {
          format: "TV",
          rootFolder: animeRoot,
          startDate: "2025-01-01",
          startYear: 2025,
          titleRomaji: "Show",
        } as typeof anime.$inferSelect,
        1,
        sourcePath,
        "copy",
        {
          episodeRows: [{ aired: "2025-03-14", title: "Pilot" }],
          namingFormat: "{title} - S{season:02}E{episode:02}",
          preferredTitle: "romaji",
        },
      );

      assertEquals(destination, expectedDestination);
    }),
  )
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
        {
          format: "TV",
          rootFolder: animeRoot,
          startDate: "2025-01-01",
          startYear: 2025,
          titleRomaji: "Show",
        } as typeof anime.$inferSelect,
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
          namingFormat:
            "{title} - {source_episode_segment} [{quality} {resolution}]",
          preferredTitle: "romaji",
        },
      );

      assertEquals(destination, expectedDestination);
    }),
  )
);

it.scoped("importDownloadedFile uses local media metadata when heuristics are missing", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const { animeRoot, sourceRoot } = yield* makeImportRoots(fs, root);
      const sourcePath = `${sourceRoot}/download.mkv`;
      const expectedDestination =
        `${animeRoot}/Show - 01 [1080p][HEVC][AAC 2.0].mkv`;

      yield* writeTextFile(fs, sourcePath, "incoming");

      const destination = yield* importDownloadedFile(
        fs,
        {
          format: "TV",
          rootFolder: animeRoot,
          startDate: "2025-01-01",
          startYear: 2025,
          titleRomaji: "Show",
        } as typeof anime.$inferSelect,
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
        },
      );

      assertEquals(destination, expectedDestination);
    }),
  )
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
