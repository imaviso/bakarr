import { and, eq, inArray } from "drizzle-orm";

import type { Config, DownloadSourceMetadata } from "../../../../../packages/shared/src/index.ts";
import { type AppDatabase, isBusySqliteCause } from "../../db/database.ts";
import { episodes } from "../../db/schema.ts";
import { anime } from "../../db/schema.ts";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { isCrossFilesystemError } from "../../lib/fs-errors.ts";
import type { ProbedMediaMetadata } from "../../lib/media-probe.ts";
import { Effect, Schema } from "effect";
import { buildEpisodeFilenamePlan } from "./naming-support.ts";
import type { PreferredTitle } from "../../../../../packages/shared/src/index.ts";

const SQLITE_BUSY_RETRY_COUNT = 8;

export class ImportRollbackError {
  readonly _tag = "ImportRollbackError";
  constructor(
    readonly message: string,
    readonly cause: unknown,
    readonly rolledBack: boolean,
  ) {}
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
  constructor(
    readonly message: string,
    readonly cause?: unknown,
  ) {}
}

export class UpsertEpisodeFileError extends Schema.TaggedError<UpsertEpisodeFileError>()(
  "UpsertEpisodeFileError",
  {
    anime_id: Schema.Number,
    episode_number: Schema.Number,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

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
    randomUuid?: () => Effect.Effect<string>;
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
    const allEpisodes = options?.episodeNumbers?.length ? options.episodeNumbers : [episodeNumber];
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
    const destination = `${animeRow.rootFolder.replace(/\/$/, "")}/${baseName}${extension}`;
    const tempDestination = `${destination}.tmp.${yield* (options?.randomUuid ?? randomUuidEffect)()}`;

    yield* fs.mkdir(animeRow.rootFolder, { recursive: true });

    const cleanupTempDestination = fs.remove(tempDestination).pipe(
      Effect.catchTag("FileSystemError", (fsError) =>
        Effect.logWarning("Failed to clean up temp import file after move failure").pipe(
          Effect.annotateLogs({
            error: String(fsError),
            temp_path: tempDestination,
          }),
          Effect.asVoid,
        ),
      ),
    );

    yield* (
      importMode === "move"
        ? fs
            .rename(sourcePath, tempDestination)
            .pipe(
              Effect.catchTag("FileSystemError", (error) =>
                isCrossFilesystemError(error)
                  ? fs
                      .copyFile(sourcePath, tempDestination)
                      .pipe(
                        Effect.flatMap(() =>
                          fs
                            .remove(sourcePath)
                            .pipe(
                              Effect.catchTag("FileSystemError", (removeError) =>
                                cleanupTempDestination.pipe(
                                  Effect.zipRight(Effect.fail(removeError)),
                                ),
                              ),
                            ),
                        ),
                      )
                  : Effect.fail(error),
              ),
            )
        : fs.copyFile(sourcePath, tempDestination)
    ).pipe(
      Effect.mapError(
        (cause) => new ImportFileError(`Failed to ${importMode} file to temp destination`, cause),
      ),
    );

    const backupDestination = `${destination}.bak.${yield* (options?.randomUuid ?? randomUuidEffect)()}`;
    const existingStat = yield* Effect.either(fs.stat(destination));
    const hasExisting = existingStat._tag === "Right";

    if (hasExisting) {
      yield* fs
        .rename(destination, backupDestination)
        .pipe(
          Effect.mapError(
            (cause) => new ImportFileError("Failed to back up existing destination", cause),
          ),
        );
    }

    const renameResult = yield* Effect.either(fs.rename(tempDestination, destination));

    if (renameResult._tag === "Left") {
      if (hasExisting) {
        yield* fs.rename(backupDestination, destination).pipe(
          Effect.catchTag("FileSystemError", (fsError) =>
            Effect.logWarning("Failed to restore backup after rename failure").pipe(
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
        Effect.catchTag("FileSystemError", (fsError) =>
          Effect.logWarning("Failed to remove temp file after rename failure").pipe(
            Effect.annotateLogs({
              error: String(fsError),
              temp_path: tempDestination,
            }),
            Effect.asVoid,
          ),
        ),
      );
      return yield* Effect.fail(
        new ImportFileError("Failed to rename temp file to destination", renameResult.left),
      );
    }

    if (hasExisting) {
      yield* fs.remove(backupDestination).pipe(
        Effect.catchTag("FileSystemError", (fsError) =>
          Effect.logWarning("Failed to remove backup file after successful import").pipe(
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

export const upsertEpisodeFilesAtomic = Effect.fn("Operations.upsertEpisodeFilesAtomic")(function* (
  db: AppDatabase,
  animeId: number,
  episodeNumbers: readonly number[],
  destination: string,
) {
  if (episodeNumbers.length === 0) {
    return;
  }

  const upsertOnce = Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        const episodeNumbersArr = [...episodeNumbers];

        const existingRows = await tx
          .select()
          .from(episodes)
          .where(and(eq(episodes.animeId, animeId), inArray(episodes.number, episodeNumbersArr)));

        const existingEpisodeNumbers = new Set(existingRows.map((r) => r.number));
        const missingEpisodeNumbers = episodeNumbersArr.filter(
          (n) => !existingEpisodeNumbers.has(n),
        );

        if (existingEpisodeNumbers.size > 0) {
          await tx
            .update(episodes)
            .set({
              downloaded: true,
              filePath: destination,
            })
            .where(
              and(
                eq(episodes.animeId, animeId),
                inArray(episodes.number, [...existingEpisodeNumbers]),
              ),
            );
        }

        if (missingEpisodeNumbers.length > 0) {
          const valuesToInsert = missingEpisodeNumbers.map((num) => ({
            aired: null,
            animeId,
            downloaded: true,
            filePath: destination,
            number: num,
            title: null,
          }));

          await tx
            .insert(episodes)
            .values(valuesToInsert)
            .onConflictDoUpdate({
              target: [episodes.animeId, episodes.number],
              set: {
                downloaded: true,
                filePath: destination,
              },
            });
        }
      }),
    catch: (cause) =>
      new UpsertEpisodeFileError({
        anime_id: animeId,
        episode_number: episodeNumbers[0] ?? 0,
        message: "Failed to upsert episode files",
        cause,
      }),
  });

  const attempt = (remaining: number): Effect.Effect<void, UpsertEpisodeFileError> =>
    upsertOnce.pipe(
      Effect.catchTag("UpsertEpisodeFileError", (error) =>
        isBusySqliteCause(error.cause) && remaining > 0
          ? Effect.sleep("25 millis").pipe(Effect.zipRight(attempt(remaining - 1)))
          : Effect.fail(error),
      ),
    );

  yield* attempt(SQLITE_BUSY_RETRY_COUNT);
});

export const upsertEpisodeFiles = Effect.fn("Operations.upsertEpisodeFiles")(function* (
  db: AppDatabase,
  animeId: number,
  episodeNumbers: readonly number[],
  destination: string,
) {
  yield* upsertEpisodeFilesAtomic(db, animeId, episodeNumbers, destination);
});

export const upsertEpisodeFile = Effect.fn("Operations.upsertEpisodeFile")(function* (
  db: AppDatabase,
  animeId: number,
  episodeNumber: number,
  destination: string,
) {
  yield* upsertEpisodeFilesAtomic(db, animeId, [episodeNumber], destination);
});

const randomUuidEffect = () => Effect.sync(() => crypto.randomUUID());
