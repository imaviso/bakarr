import { and, eq } from "drizzle-orm";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { episodes } from "../../db/schema.ts";
import { anime } from "../../db/schema.ts";
import {
  FileSystemError,
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

export class ImportFileError {
  readonly _tag = "ImportFileError";
  constructor(readonly message: string, readonly cause?: unknown) {}
}

export function importDownloadedFile(
  fs: FileSystemShape,
  animeRow: typeof anime.$inferSelect,
  episodeNumber: number,
  sourcePath: string,
  importMode: string,
): Effect.Effect<string, ImportFileError | FileSystemError, never> {
  return Effect.gen(function* () {
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
    const tempDestination = `${destination}.tmp.${crypto.randomUUID()}`;

    yield* fs.mkdir(animeRow.rootFolder, { recursive: true });

    yield* (
      importMode === "move"
        ? fs.rename(sourcePath, tempDestination)
        : fs.copyFile(sourcePath, tempDestination)
    ).pipe(
      Effect.mapError((cause) =>
        new ImportFileError(
          `Failed to ${importMode} file to temp destination`,
          cause,
        )
      ),
    );

    yield* fs.remove(destination).pipe(
      Effect.catchTag("FileSystemError", () => Effect.void),
    );

    const renameResult = yield* Effect.either(
      fs.rename(tempDestination, destination),
    );

    if (renameResult._tag === "Left") {
      yield* fs.remove(tempDestination).pipe(
        Effect.catchTag("FileSystemError", () => Effect.void),
      );
      return yield* Effect.fail(
        new ImportFileError(
          "Failed to rename temp file to destination",
          renameResult.left,
        ),
      );
    }

    return destination;
  });
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
