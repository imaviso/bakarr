import { and, eq } from "drizzle-orm";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { episodes } from "../../db/schema.ts";
import { anime } from "../../db/schema.ts";
import {
  type FileSystemShape,
  sanitizeFilename,
} from "../../lib/filesystem.ts";
import { Effect } from "effect";

export function shouldReconcileCompletedDownloads(config: Config | null) {
  return config?.downloads.reconcile_completed_downloads ?? true;
}

export function shouldRemoveTorrentOnImport(config: Config | null | undefined) {
  return config?.downloads.remove_torrent_on_import ?? true;
}

export function shouldDeleteImportedData(config: Config | null | undefined) {
  return config?.downloads.delete_download_files_after_import ?? false;
}

export async function importDownloadedFile(
  fs: FileSystemShape,
  animeRow: typeof anime.$inferSelect,
  episodeNumber: number,
  sourcePath: string,
  importMode: string,
): Promise<string> {
  if (
    sourcePath.startsWith(animeRow.rootFolder.replace(/\/$/, "") + "/") ||
    sourcePath === animeRow.rootFolder
  ) {
    return sourcePath;
  }

  const extension = sourcePath.includes(".")
    ? sourcePath.slice(sourcePath.lastIndexOf("."))
    : ".mkv";
  const destination = `${animeRow.rootFolder.replace(/\/$/, "")}/${
    sanitizeFilename(animeRow.titleRomaji)
  } - ${String(episodeNumber).padStart(2, "0")}${extension}`;

  await Effect.runPromise(fs.mkdir(animeRow.rootFolder, { recursive: true }));

  try {
    if (destination !== sourcePath) {
      await Effect.runPromise(
        fs.remove(destination).pipe(Effect.catchAll(() => Effect.void)),
      );
    }
  } catch {
    // Ignore destination cleanup failures.
  }

  if (importMode === "move") {
    await Effect.runPromise(fs.rename(sourcePath, destination));
  } else {
    await Effect.runPromise(fs.copyFile(sourcePath, destination));
  }

  return destination;
}

export async function upsertEpisodeFile(
  db: AppDatabase,
  animeId: number,
  episodeNumber: number,
  destination: string,
) {
  const rows = await db.select().from(episodes).where(
    and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)),
  ).limit(1);
  if (rows[0]) {
    await db.update(episodes).set({ downloaded: true, filePath: destination })
      .where(eq(episodes.id, rows[0].id));
    return;
  }

  try {
    await db.insert(episodes).values({
      aired: null,
      animeId,
      downloaded: true,
      filePath: destination,
      number: episodeNumber,
      title: null,
    });
  } catch {
    const existingRows = await db.select().from(episodes).where(
      and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)),
    ).limit(1);

    if (!existingRows[0]) {
      throw new Error("Failed to upsert episode file");
    }

    await db.update(episodes).set({
      downloaded: true,
      filePath: destination,
    }).where(eq(episodes.id, existingRows[0].id));
  }
}
