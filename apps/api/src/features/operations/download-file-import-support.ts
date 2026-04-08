import { Effect, Schema } from "effect";

import type { DownloadSourceMetadata, ImportMode, PreferredTitle } from "@packages/shared/index.ts";
import { anime } from "@/db/schema.ts";
import { buildEpisodeFilenamePlan } from "@/features/operations/naming-support.ts";
import { isCrossFilesystemError, isNotFoundError } from "@/lib/fs-errors.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import type { ProbedMediaMetadata } from "@/lib/media-probe.ts";

export class ImportFileError extends Schema.TaggedError<ImportFileError>()("ImportFileError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

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
