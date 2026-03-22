import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import { anime } from "../../db/schema.ts";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { runTestEffect, runTestEffectExit } from "../../test/effect-test.ts";
import {
  makeNoopTestFileSystemWithOverrides,
  readTextFile,
  withFileSystemSandbox,
  writeTextFile,
} from "../../test/filesystem-test.ts";
import { makeDefaultConfig } from "../system/defaults.ts";
import {
  importDownloadedFile,
  shouldDeleteImportedData,
  shouldReconcileCompletedDownloads,
  shouldRemoveTorrentOnImport,
} from "./download-support.ts";

Deno.test("download support helpers use config values and defaults", () => {
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

Deno.test("importDownloadedFile keeps existing destination when staging copy fails", async () => {
  await withFileSystemSandbox(async ({ fs, root }) => {
    const { animeRoot, sourceRoot } = await makeImportRoots(fs, root);
    const sourcePath = `${sourceRoot}/Naruto - 01.mkv`;
    const destinationPath = `${animeRoot}/Naruto - 01.mkv`;

    await runTestEffect(writeTextFile(fs, sourcePath, "incoming"));
    await runTestEffect(writeTextFile(fs, destinationPath, "existing"));

    const failingFs = await makeNoopTestFileSystemWithOverrides({
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

    const exit = await runTestEffectExit(
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
    const destinationContents = await runTestEffect(
      readTextFile(fs, destinationPath),
    );
    assertEquals(destinationContents, "existing");
  });
});

Deno.test("importDownloadedFile applies configured naming tokens from source filename metadata", async () => {
  const namingFormat =
    "{title} - S{season:02}E{episode:02} - {episode_title} [{quality} {resolution}][{video_codec}][{audio_codec} {audio_channels}][{group}]";

  await withFileSystemSandbox(async ({ fs, root }) => {
    const { animeRoot, sourceRoot } = await makeImportRoots(fs, root);
    const sourcePath =
      `${sourceRoot}/Rock Is a Lady's Modesty (2025) - S01E01 - Good Day to You Quit Playing the Guitar!!! [v2 WEBDL-1080p Proper][AAC 2.0][AVC][SubsPlus+].mkv`;
    const expectedDestination =
      `${animeRoot}/Rock Is a Lady's Modesty - S01E01 - Good Day to You Quit Playing the Guitar!!! [WEB-DL 1080p][AVC][AAC 2.0][SubsPlus+].mkv`;

    await runTestEffect(writeTextFile(fs, sourcePath, "incoming"));

    const destination = await runTestEffect(
      importDownloadedFile(
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
      ),
    );

    assertEquals(destination, expectedDestination);
    assertEquals(
      await runTestEffect(readTextFile(fs, destination)),
      "incoming",
    );
    assertEquals(await runTestEffect(readTextFile(fs, sourcePath)), "incoming");
  });
});

Deno.test("importDownloadedFile respects preferred title when building destination", async () => {
  await withFileSystemSandbox(async ({ fs, root }) => {
    const { animeRoot, sourceRoot } = await makeImportRoots(fs, root);
    const sourcePath = `${sourceRoot}/movie-source-file.mkv`;
    const expectedDestination = `${animeRoot}/Your Name. (2016).mkv`;

    await runTestEffect(writeTextFile(fs, sourcePath, "incoming"));

    const destination = await runTestEffect(
      importDownloadedFile(
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
      ),
    );

    assertEquals(destination, expectedDestination);
  });
});

Deno.test("importDownloadedFile uses episode DB metadata and fallback naming plan", async () => {
  await withFileSystemSandbox(async ({ fs, root }) => {
    const { animeRoot, sourceRoot } = await makeImportRoots(fs, root);
    const sourcePath = `${sourceRoot}/Show - 01.mkv`;
    const expectedDestination = `${animeRoot}/Show - 01.mkv`;

    await runTestEffect(writeTextFile(fs, sourcePath, "incoming"));

    const destination = await runTestEffect(
      importDownloadedFile(
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
      ),
    );

    assertEquals(destination, expectedDestination);
  });
});

Deno.test("importDownloadedFile reuses stored provenance when source path is weak", async () => {
  await withFileSystemSandbox(async ({ fs, root }) => {
    const { animeRoot, sourceRoot } = await makeImportRoots(fs, root);
    const sourcePath = `${sourceRoot}/download.mkv`;
    const expectedDestination = `${animeRoot}/Show - 01 [WEB-DL 1080p].mkv`;

    await runTestEffect(writeTextFile(fs, sourcePath, "incoming"));

    const destination = await runTestEffect(
      importDownloadedFile(
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
      ),
    );

    assertEquals(destination, expectedDestination);
  });
});

Deno.test("importDownloadedFile uses local media metadata when heuristics are missing", async () => {
  await withFileSystemSandbox(async ({ fs, root }) => {
    const { animeRoot, sourceRoot } = await makeImportRoots(fs, root);
    const sourcePath = `${sourceRoot}/download.mkv`;
    const expectedDestination =
      `${animeRoot}/Show - 01 [1080p][HEVC][AAC 2.0].mkv`;

    await runTestEffect(writeTextFile(fs, sourcePath, "incoming"));

    const destination = await runTestEffect(
      importDownloadedFile(
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
      ),
    );

    assertEquals(destination, expectedDestination);
  });
});

async function makeImportRoots(
  fs: FileSystemShape,
  root: string,
) {
  const animeRoot = `${root}/anime`;
  const sourceRoot = `${root}/source`;
  await runTestEffect(fs.mkdir(animeRoot, { recursive: true }));
  await runTestEffect(fs.mkdir(sourceRoot, { recursive: true }));
  return { animeRoot, sourceRoot };
}
