import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import { anime } from "../../db/schema.ts";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { runTestEffect, runTestEffectExit } from "../../test/effect-test.ts";
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
  const animeRoot = await Deno.makeTempDir();
  const sourceRoot = await Deno.makeTempDir();

  try {
    const sourcePath = `${sourceRoot}/Naruto - 01.mkv`;
    const destinationPath = `${animeRoot}/Naruto - 01.mkv`;

    await Deno.writeTextFile(sourcePath, "incoming");
    await Deno.mkdir(animeRoot, { recursive: true });
    await Deno.writeTextFile(destinationPath, "existing");

    const fs = makeTestFileSystem({
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
        fs,
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

    let destinationContents: string | null = null;

    try {
      destinationContents = await Deno.readTextFile(destinationPath);
    } catch {
      destinationContents = null;
    }

    assertEquals(destinationContents, "existing");
  } finally {
    await Deno.remove(animeRoot, { recursive: true }).catch(() => undefined);
    await Deno.remove(sourceRoot, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("importDownloadedFile applies configured naming tokens from source filename metadata", async () => {
  const animeRoot = await Deno.makeTempDir();
  const sourceRoot = await Deno.makeTempDir();
  const namingFormat =
    "{title} - S{season:02}E{episode:02} - {episode_title} [{quality} {resolution}][{video_codec}][{audio_codec} {audio_channels}][{group}]";

  try {
    const sourcePath =
      `${sourceRoot}/Rock Is a Lady's Modesty (2025) - S01E01 - Good Day to You Quit Playing the Guitar!!! [v2 WEBDL-1080p Proper][AAC 2.0][AVC][SubsPlus+].mkv`;
    const expectedDestination =
      `${animeRoot}/Rock Is a Lady's Modesty - S01E01 - Good Day to You Quit Playing the Guitar!!! [WEB-DL 1080p][AVC][AAC 2.0][SubsPlus+].mkv`;

    await Deno.writeTextFile(sourcePath, "incoming");

    const destination = await runTestEffect(
      importDownloadedFile(
        makeTestFileSystem(),
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
    assertEquals(await Deno.readTextFile(destination), "incoming");
    assertEquals(await Deno.readTextFile(sourcePath), "incoming");
  } finally {
    await Deno.remove(animeRoot, { recursive: true }).catch(() => undefined);
    await Deno.remove(sourceRoot, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("importDownloadedFile respects preferred title when building destination", async () => {
  const animeRoot = await Deno.makeTempDir();
  const sourceRoot = await Deno.makeTempDir();

  try {
    const sourcePath = `${sourceRoot}/movie-source-file.mkv`;
    const expectedDestination = `${animeRoot}/Your Name. (2016).mkv`;

    await Deno.writeTextFile(sourcePath, "incoming");

    const destination = await runTestEffect(
      importDownloadedFile(
        makeTestFileSystem(),
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
  } finally {
    await Deno.remove(animeRoot, { recursive: true }).catch(() => undefined);
    await Deno.remove(sourceRoot, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("importDownloadedFile uses episode DB metadata and fallback naming plan", async () => {
  const animeRoot = await Deno.makeTempDir();
  const sourceRoot = await Deno.makeTempDir();

  try {
    const sourcePath = `${sourceRoot}/Show - 01.mkv`;
    const expectedDestination = `${animeRoot}/Show - 01.mkv`;

    await Deno.writeTextFile(sourcePath, "incoming");

    const destination = await runTestEffect(
      importDownloadedFile(
        makeTestFileSystem(),
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
  } finally {
    await Deno.remove(animeRoot, { recursive: true }).catch(() => undefined);
    await Deno.remove(sourceRoot, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("importDownloadedFile reuses stored provenance when source path is weak", async () => {
  const animeRoot = await Deno.makeTempDir();
  const sourceRoot = await Deno.makeTempDir();

  try {
    const sourcePath = `${sourceRoot}/download.mkv`;
    const expectedDestination = `${animeRoot}/Show - 01 [WEB-DL 1080p].mkv`;

    await Deno.writeTextFile(sourcePath, "incoming");

    const destination = await runTestEffect(
      importDownloadedFile(
        makeTestFileSystem(),
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
  } finally {
    await Deno.remove(animeRoot, { recursive: true }).catch(() => undefined);
    await Deno.remove(sourceRoot, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("importDownloadedFile uses local media metadata when heuristics are missing", async () => {
  const animeRoot = await Deno.makeTempDir();
  const sourceRoot = await Deno.makeTempDir();

  try {
    const sourcePath = `${sourceRoot}/download.mkv`;
    const expectedDestination =
      `${animeRoot}/Show - 01 [1080p][HEVC][AAC 2.0].mkv`;

    await Deno.writeTextFile(sourcePath, "incoming");

    const destination = await runTestEffect(
      importDownloadedFile(
        makeTestFileSystem(),
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
  } finally {
    await Deno.remove(animeRoot, { recursive: true }).catch(() => undefined);
    await Deno.remove(sourceRoot, { recursive: true }).catch(() => undefined);
  }
});

function makeTestFileSystem(
  overrides: Partial<FileSystemShape> = {},
): FileSystemShape {
  const wrap = <A>(
    path: string | URL,
    message: string,
    operation: () => Promise<A>,
  ) =>
    Effect.tryPromise({
      try: operation,
      catch: (cause) =>
        new FileSystemError({ cause, message, path: toPathString(path) }),
    });

  const base: FileSystemShape = {
    copyFile: (from, to) =>
      wrap(from, "Failed to copy file", () => Deno.copyFile(from, to)),
    openFile: (path, options) =>
      Effect.acquireRelease(
        wrap(path, "Failed to open file", () => Deno.open(path, options)),
        (file) => Effect.sync(() => file.close()),
      ),
    mkdir: (path, options) =>
      wrap(path, "Failed to create directory", () => Deno.mkdir(path, options)),
    readDir: (path) =>
      wrap(
        path,
        "Failed to read directory",
        () => Array.fromAsync(Deno.readDir(path)),
      ),
    readFile: (path) =>
      wrap(path, "Failed to read file", () => Deno.readFile(path)),
    realPath: (path) =>
      wrap(path, "Failed to resolve path", () => Deno.realPath(path)),
    remove: (path, options) =>
      wrap(path, "Failed to remove", () => Deno.remove(path, options)),
    rename: (from, to) =>
      wrap(from, "Failed to rename", () => Deno.rename(from, to)),
    stat: (path) => wrap(path, "Failed to stat path", () => Deno.stat(path)),
    writeFile: (path, data) =>
      wrap(path, "Failed to write file", () => Deno.writeFile(path, data)),
  };

  return { ...base, ...overrides };
}

function toPathString(path: string | URL) {
  return typeof path === "string" ? path : path.toString();
}
