import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import { anime } from "../../db/schema.ts";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { runTestEffectExit } from "../../test/effect-test.ts";
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
