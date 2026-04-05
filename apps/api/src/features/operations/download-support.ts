import { and, eq, inArray } from "drizzle-orm";

import type { Config, DownloadSourceMetadata, ImportMode } from "@packages/shared/index.ts";
import { type AppDatabase } from "@/db/database.ts";
import { episodes } from "@/db/schema.ts";
import { anime } from "@/db/schema.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import { isCrossFilesystemError } from "@/lib/fs-errors.ts";
import { isNotFoundError } from "@/lib/fs-errors.ts";
import type { ProbedMediaMetadata } from "@/lib/media-probe.ts";
import { Effect, Schema } from "effect";
import { buildEpisodeFilenamePlan } from "@/features/operations/naming-support.ts";
import type { PreferredTitle } from "@packages/shared/index.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export function shouldReconcileCompletedDownloads(config: Config | null) {
  return config?.downloads.reconcile_completed_downloads ?? true;
}

export function shouldRemoveTorrentOnImport(config: Config | null | undefined) {
  return config?.downloads.remove_torrent_on_import ?? true;
}

export function shouldDeleteImportedData(config: Config | null | undefined) {
  return config?.downloads.delete_download_files_after_import ?? false;
}

export class ImportFileError extends Schema.TaggedError<ImportFileError>()("ImportFileError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export class UpsertEpisodeFileError extends Schema.TaggedError<UpsertEpisodeFileError>()(
  "UpsertEpisodeFileError",
  {
    anime_id: Schema.Number,
    episode_number: Schema.Number,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const importDownloadedFile = Effect.fn("Operations.importDownloadedFile")(function* (
  fs: FileSystemShape,
  animeRow: typeof anime.$inferSelect,
  episodeNumber: number,
  sourcePath: string,
  importMode: ImportMode,
  options: {
    randomUuid: () => Effect.Effect<string>;
    episodeNumbers?: readonly number[];
    namingFormat?: string;
    preferredTitle?: PreferredTitle;
    episodeRows?: readonly { title?: string | null; aired?: string | null }[];
    downloadSourceMetadata?: DownloadSourceMetadata;
    localMediaMetadata?: ProbedMediaMetadata;
    season?: number;
  },
) {
  if (
    sourcePath.startsWith(animeRow.rootFolder.replace(/\/$/, "") + "/") ||
    sourcePath === animeRow.rootFolder
  ) {
    return sourcePath;
  }

  const allEpisodes = options?.episodeNumbers?.length ? options.episodeNumbers : [episodeNumber];
  const importPlan = yield* buildImportFilePlan({
    animeRow,
    episodeNumbers: allEpisodes,
    options,
    randomUuid: options.randomUuid,
    sourcePath,
  });

  yield* fs.mkdir(animeRow.rootFolder, { recursive: true });
  yield* stageSourceIntoTempFile({
    fs,
    importMode,
    sourcePath,
    tempDestination: importPlan.tempDestination,
  });

  const hasExistingDestination = yield* hasExistingFile(fs, importPlan.destination);

  if (hasExistingDestination) {
    yield* fs
      .rename(importPlan.destination, importPlan.backupDestination)
      .pipe(
        Effect.mapError(
          (cause) =>
            new ImportFileError({ message: "Failed to back up existing destination", cause }),
        ),
      );
  }

  const renameResult = yield* Effect.either(
    fs.rename(importPlan.tempDestination, importPlan.destination),
  );

  if (renameResult._tag === "Left") {
    if (hasExistingDestination) {
      yield* fs.rename(importPlan.backupDestination, importPlan.destination).pipe(
        Effect.catchTag("FileSystemError", (fsError) =>
          Effect.logWarning("Failed to restore backup after rename failure").pipe(
            Effect.annotateLogs({
              backup_path: importPlan.backupDestination,
              destination_path: importPlan.destination,
              error: String(fsError),
            }),
            Effect.asVoid,
          ),
        ),
      );
    }
    yield* fs.remove(importPlan.tempDestination).pipe(
      Effect.catchTag("FileSystemError", (fsError) =>
        Effect.logWarning("Failed to remove temp file after rename failure").pipe(
          Effect.annotateLogs({
            error: String(fsError),
            temp_path: importPlan.tempDestination,
          }),
          Effect.asVoid,
        ),
      ),
    );
    return yield* new ImportFileError({
      message: "Failed to rename temp file to destination",
      cause: renameResult.left,
    });
  }

  if (hasExistingDestination) {
    yield* fs.remove(importPlan.backupDestination).pipe(
      Effect.catchTag("FileSystemError", (fsError) =>
        Effect.logWarning("Failed to remove backup file after successful import").pipe(
          Effect.annotateLogs({
            backup_path: importPlan.backupDestination,
            error: String(fsError),
          }),
          Effect.asVoid,
        ),
      ),
    );
  }

  return importPlan.destination;
});

function buildImportFilePlan(input: {
  animeRow: typeof anime.$inferSelect;
  episodeNumbers: readonly number[];
  options: {
    namingFormat?: string;
    preferredTitle?: PreferredTitle;
    episodeRows?: readonly { title?: string | null; aired?: string | null }[] | undefined;
    downloadSourceMetadata?: DownloadSourceMetadata;
    localMediaMetadata?: ProbedMediaMetadata;
    season?: number;
  };
  randomUuid: () => Effect.Effect<string>;
  sourcePath: string;
}) {
  return Effect.gen(function* () {
    const extension = input.sourcePath.includes(".")
      ? input.sourcePath.slice(input.sourcePath.lastIndexOf("."))
      : ".mkv";
    const namingFormat = input.options.namingFormat ?? "{title} - {episode_segment}";
    const namingPlan = buildEpisodeFilenamePlan({
      animeRow: input.animeRow,
      episodeNumbers: input.episodeNumbers,
      filePath: input.sourcePath,
      namingFormat,
      preferredTitle: input.options.preferredTitle ?? "romaji",
      ...(input.options.episodeRows ? { episodeRows: input.options.episodeRows } : {}),
      ...(input.options.downloadSourceMetadata
        ? { downloadSourceMetadata: input.options.downloadSourceMetadata }
        : {}),
      ...(input.options.localMediaMetadata
        ? { localMediaMetadata: input.options.localMediaMetadata }
        : {}),
      ...(input.options.season !== undefined ? { season: input.options.season } : {}),
    });
    const destination = `${input.animeRow.rootFolder.replace(/\/$/, "")}/${namingPlan.baseName}${extension}`;
    const suffix = yield* input.randomUuid();
    const backupSuffix = yield* input.randomUuid();

    return {
      backupDestination: `${destination}.bak.${backupSuffix}`,
      destination,
      tempDestination: `${destination}.tmp.${suffix}`,
    } as const;
  });
}

function stageSourceIntoTempFile(input: {
  fs: FileSystemShape;
  importMode: ImportMode;
  sourcePath: string;
  tempDestination: string;
}) {
  const cleanupTempDestination = input.fs.remove(input.tempDestination).pipe(
    Effect.catchTag("FileSystemError", (fsError) =>
      Effect.logWarning("Failed to clean up temp import file after move failure").pipe(
        Effect.annotateLogs({
          error: String(fsError),
          temp_path: input.tempDestination,
        }),
        Effect.asVoid,
      ),
    ),
  );

  return (
    input.importMode === "move"
      ? input.fs
          .rename(input.sourcePath, input.tempDestination)
          .pipe(
            Effect.catchTag("FileSystemError", (error) =>
              isCrossFilesystemError(error)
                ? input.fs
                    .copyFile(input.sourcePath, input.tempDestination)
                    .pipe(
                      Effect.flatMap(() =>
                        input.fs
                          .remove(input.sourcePath)
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
      : input.fs.copyFile(input.sourcePath, input.tempDestination)
  ).pipe(
    Effect.mapError(
      (cause) =>
        new ImportFileError({
          message: `Failed to ${input.importMode} file to temp destination`,
          cause,
        }),
    ),
  );
}

function hasExistingFile(fs: FileSystemShape, destination: string) {
  return fs.stat(destination).pipe(
    Effect.as(true),
    Effect.catchTag("FileSystemError", (error) =>
      isNotFoundError(error) ? Effect.succeed(false) : Effect.fail(error),
    ),
    Effect.mapError(
      (cause) =>
        new ImportFileError({
          message: "Failed to determine destination file existence",
          cause,
        }),
    ),
  );
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

  yield* tryDatabasePromise("Failed to upsert episode files", () =>
    db.transaction(async (tx) => {
      const episodeNumbersArr = [...episodeNumbers];

      const existingRows = await tx
        .select()
        .from(episodes)
        .where(and(eq(episodes.animeId, animeId), inArray(episodes.number, episodeNumbersArr)));

      const existingEpisodeNumbers = new Set(existingRows.map((r) => r.number));
      const missingEpisodeNumbers = episodeNumbersArr.filter((n) => !existingEpisodeNumbers.has(n));

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
  ).pipe(
    Effect.mapError(
      (cause) =>
        new UpsertEpisodeFileError({
          anime_id: animeId,
          episode_number: episodeNumbers[0] ?? 0,
          message: cause.message,
          cause,
        }),
    ),
  );
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
