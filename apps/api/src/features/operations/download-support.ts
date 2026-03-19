import { and, eq } from "drizzle-orm";

import type {
  Config,
  DownloadSourceMetadata,
} from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { episodes } from "../../db/schema.ts";
import { anime } from "../../db/schema.ts";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import type { ProbedMediaMetadata } from "../../lib/media-probe.ts";
import { Effect, Schema } from "effect";
import { buildEpisodeFilenamePlan } from "./naming-support.ts";
import type { PreferredTitle } from "../../../../../packages/shared/src/index.ts";

export class ImportRollbackError {
  readonly _tag = "ImportRollbackError";
  constructor(
    readonly message: string,
    readonly cause: unknown,
    readonly rolledBack: boolean,
  ) {}
}

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

export class UpsertEpisodeFileError extends Schema.TaggedError<
  UpsertEpisodeFileError
>()("UpsertEpisodeFileError", {
  anime_id: Schema.Number,
  episode_number: Schema.Number,
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export function importDownloadedFile(
  fs: FileSystemShape,
  animeRow: typeof anime.$inferSelect,
  episodeNumber: number,
  sourcePath: string,
  importMode: string,
  options?: {
    episodeNumbers?: readonly number[];
    namingFormat?: string;
    preferredTitle?: PreferredTitle;
    episodeRows?: readonly { title?: string | null; aired?: string | null }[];
    downloadSourceMetadata?: DownloadSourceMetadata;
    localMediaMetadata?: ProbedMediaMetadata;
    season?: number;
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
    const plan = buildEpisodeFilenamePlan({
      animeRow,
      downloadSourceMetadata: options?.downloadSourceMetadata,
      episodeNumbers: allEpisodes,
      episodeRows: options?.episodeRows,
      filePath: sourcePath,
      localMediaMetadata: options?.localMediaMetadata,
      namingFormat,
      preferredTitle: options?.preferredTitle ?? "romaji",
      season: options?.season,
    });
    const baseName = plan.baseName;
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
          Effect.catchTag(
            "FileSystemError",
            (fsError) =>
              Effect.logWarning("Failed to restore backup after rename failure")
                .pipe(
                  Effect.annotateLogs({
                    backup_path: backupDestination,
                    destination_path: destination,
                    error: String(fsError),
                  }),
                  Effect.asVoid,
                ),
          ),
        );
      }
      yield* fs.remove(tempDestination).pipe(
        Effect.catchTag(
          "FileSystemError",
          (fsError) =>
            Effect.logWarning("Failed to remove temp file after rename failure")
              .pipe(
                Effect.annotateLogs({
                  error: String(fsError),
                  temp_path: tempDestination,
                }),
                Effect.asVoid,
              ),
        ),
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
        Effect.catchTag(
          "FileSystemError",
          (fsError) =>
            Effect.logWarning(
              "Failed to remove backup file after successful import",
            ).pipe(
              Effect.annotateLogs({
                backup_path: backupDestination,
                error: String(fsError),
              }),
              Effect.asVoid,
            ),
        ),
      );
    }

    return destination;
  });
}

export async function upsertEpisodeFilesAtomic(
  db: AppDatabase,
  animeId: number,
  episodeNumbers: readonly number[],
  destination: string,
): Promise<void> {
  if (episodeNumbers.length === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    for (const episodeNumber of episodeNumbers) {
      const rows = await tx.select().from(episodes).where(
        and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)),
      ).limit(1);

      if (rows[0]) {
        await tx.update(episodes).set({
          downloaded: true,
          filePath: destination,
        })
          .where(eq(episodes.id, rows[0].id));
      } else {
        try {
          await tx.insert(episodes).values({
            aired: null,
            animeId,
            downloaded: true,
            filePath: destination,
            number: episodeNumber,
            title: null,
          });
        } catch (cause) {
          const existingRows = await tx.select().from(episodes).where(
            and(
              eq(episodes.animeId, animeId),
              eq(episodes.number, episodeNumber),
            ),
          ).limit(1);

          if (!existingRows[0]) {
            throw new UpsertEpisodeFileError({
              anime_id: animeId,
              episode_number: episodeNumber,
              message: "Failed to upsert episode file",
              cause,
            });
          }

          await tx.update(episodes).set({
            downloaded: true,
            filePath: destination,
          }).where(eq(episodes.id, existingRows[0].id));
        }
      }
    }
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
  } catch (cause) {
    const existingRows = await db.select().from(episodes).where(
      and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)),
    ).limit(1);

    if (!existingRows[0]) {
      throw new UpsertEpisodeFileError({
        anime_id: animeId,
        episode_number: episodeNumber,
        message: "Failed to upsert episode file",
        cause,
      });
    }

    await db.update(episodes).set({
      downloaded: true,
      filePath: destination,
    }).where(eq(episodes.id, existingRows[0].id));
  }
}
