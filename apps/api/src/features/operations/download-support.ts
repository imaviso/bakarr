import { and, eq } from "drizzle-orm";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { episodes } from "../../db/schema.ts";
import { anime } from "../../db/schema.ts";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { renderEpisodeFilename } from "../../lib/naming.ts";
import { Effect } from "effect";

function isCrossFilesystemError(error: { cause?: unknown }): boolean {
  const cause = error.cause;
  if (cause instanceof Error && "code" in cause) {
    return (cause as { code?: string }).code === "EXDEV";
  }
  return false;
}

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
  options?: {
    episodeNumbers?: readonly number[];
    namingFormat?: string;
  },
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
    const allEpisodes = options?.episodeNumbers?.length
      ? options.episodeNumbers
      : [episodeNumber];
    const namingFormat = options?.namingFormat ?? "{title} - {episode_segment}";
    const baseName = renderEpisodeFilename(namingFormat, {
      title: animeRow.titleRomaji,
      episodeNumbers: allEpisodes,
    });
    const destination = `${
      animeRow.rootFolder.replace(/\/$/, "")
    }/${baseName}${extension}`;
    const tempDestination = `${destination}.tmp.${crypto.randomUUID()}`;

    yield* fs.mkdir(animeRow.rootFolder, { recursive: true });

    yield* (
      importMode === "move"
        ? fs.rename(sourcePath, tempDestination).pipe(
          Effect.catchTag("FileSystemError", (error) =>
            isCrossFilesystemError(error)
              ? fs.copyFile(sourcePath, tempDestination).pipe(
                Effect.flatMap(() =>
                  fs.remove(sourcePath).pipe(
                    Effect.catchTag("FileSystemError", () =>
                      Effect.void),
                  )
                ),
              )
              : Effect.fail(error)),
        )
        : fs.copyFile(sourcePath, tempDestination)
    ).pipe(
      Effect.mapError((cause) =>
        new ImportFileError(
          `Failed to ${importMode} file to temp destination`,
          cause,
        )
      ),
    );

    const backupDestination = `${destination}.bak.${crypto.randomUUID()}`;
    const existingStat = yield* Effect.either(fs.stat(destination));
    const hasExisting = existingStat._tag === "Right";

    if (hasExisting) {
      yield* fs.rename(destination, backupDestination).pipe(
        Effect.mapError((cause) =>
          new ImportFileError(
            "Failed to back up existing destination",
            cause,
          )
        ),
      );
    }

    const renameResult = yield* Effect.either(
      fs.rename(tempDestination, destination),
    );

    if (renameResult._tag === "Left") {
      if (hasExisting) {
        yield* fs.rename(backupDestination, destination).pipe(
          Effect.catchTag("FileSystemError", () => Effect.void),
        );
      }
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

    if (hasExisting) {
      yield* fs.remove(backupDestination).pipe(
        Effect.catchTag("FileSystemError", () => Effect.void),
      );
    }

    return destination;
  });
}

export async function upsertEpisodeFiles(
  db: AppDatabase,
  animeId: number,
  episodeNumbers: readonly number[],
  destination: string,
) {
  for (const episodeNumber of episodeNumbers) {
    await upsertEpisodeFile(db, animeId, episodeNumber, destination);
  }
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
