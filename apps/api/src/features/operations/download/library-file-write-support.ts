// oxlint-disable typescript-eslint/consistent-return
import { Cause, Effect, Either } from "effect";

import {
  brandMediaId,
  type DownloadSourceMetadata,
  type ImportMode,
  type ImportResult,
  type PreferredTitle,
} from "@packages/shared/index.ts";
import { media } from "@/db/schema.ts";
import { DomainPathError, InfrastructureError } from "@/features/errors.ts";
import { ImportFileError } from "@/features/operations/download/download-file-import-errors.ts";
import { isCrossFilesystemError, isNotFoundError } from "@/infra/filesystem/fs-errors.ts";
import { isWithinPathRoot, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import {
  probeMediaMetadataOrUndefined,
  type MediaProbeShape,
  type ProbedMediaMetadata,
} from "@/infra/media/probe.ts";
import { buildUnitFilenamePlan } from "@/features/operations/library/naming-canonical-support.ts";
import { hasMissingLocalMediaNamingFields } from "@/features/operations/library/naming-format-support.ts";
import type { UnitFilenamePlan } from "@/features/operations/library/naming-types.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";

export { ImportFileError };

/**
 * Single library-file-write module. Owns the destination plan (naming +
 * basename extension + containment guard), staging/replace, and the unit
 * upsert tail. Download-reconcile (`importDownloadedFile`) and catalog import
 * (`writeLibraryImportFile`) both consume it.
 */

export interface LibraryFileWritePlan {
  readonly destination: string;
  readonly filename: string;
  readonly namingPlan: UnitFilenamePlan;
}

export interface BuildLibraryFileWritePlanInput {
  readonly animeRow: typeof media.$inferSelect;
  readonly sourcePath: string;
  readonly unitNumbers: readonly number[];
  readonly namingFormat?: string;
  readonly preferredTitle?: PreferredTitle;
  readonly episodeRows?: readonly { title?: string | null; aired?: string | null }[];
  readonly downloadSourceMetadata?: DownloadSourceMetadata;
  readonly localMediaMetadata?: ProbedMediaMetadata;
  readonly season?: number;
  readonly mediaProbe?: MediaProbeShape;
}

export const buildLibraryFileWritePlan = Effect.fn("Operations.buildLibraryFileWritePlan")(
  function* (input: BuildLibraryFileWritePlanInput) {
    const sourceBaseName = input.sourcePath.split(/[\\/]/).pop() ?? input.sourcePath;
    const extension = sourceBaseName.includes(".")
      ? sourceBaseName.slice(sourceBaseName.lastIndexOf("."))
      : ".mkv";
    const preferredTitle = input.preferredTitle ?? "romaji";
    let namingPlan = buildNamingPlan(input, preferredTitle, input.localMediaMetadata);

    if (input.mediaProbe && hasMissingLocalMediaNamingFields(namingPlan.missingFields)) {
      const localMediaMetadata = yield* probeMediaMetadataOrUndefined(
        input.mediaProbe,
        input.sourcePath,
      );

      if (localMediaMetadata) {
        namingPlan = buildNamingPlan(input, preferredTitle, localMediaMetadata);
      }
    }

    const filename = `${namingPlan.baseName}${extension}`;
    const destination = `${input.animeRow.rootFolder.replace(/\/$/, "")}/${filename}`;

    if (!isWithinPathRoot(destination, input.animeRow.rootFolder)) {
      return yield* new DomainPathError({
        message: `Resolved destination escapes the media root folder: ${destination}`,
      });
    }

    return {
      destination,
      filename,
      namingPlan,
    } satisfies LibraryFileWritePlan;
  },
);

function buildNamingPlan(
  input: BuildLibraryFileWritePlanInput,
  preferredTitle: PreferredTitle,
  localMediaMetadata?: ProbedMediaMetadata,
) {
  return buildUnitFilenamePlan({
    animeRow: input.animeRow,
    unitNumbers: input.unitNumbers,
    filePath: input.sourcePath,
    ...(input.namingFormat === undefined ? {} : { namingFormat: input.namingFormat }),
    preferredTitle,
    ...(input.episodeRows === undefined ? {} : { episodeRows: input.episodeRows }),
    ...(input.downloadSourceMetadata === undefined
      ? {}
      : { downloadSourceMetadata: input.downloadSourceMetadata }),
    ...(localMediaMetadata === undefined ? {} : { localMediaMetadata }),
    ...(input.season === undefined ? {} : { season: input.season }),
  });
}

export const importDownloadedFile = Effect.fn("Operations.importDownloadedFile")(function* (
  fs: FileSystemShape,
  animeRow: typeof media.$inferSelect,
  unitNumber: number,
  sourcePath: string,
  importMode: ImportMode,
  options: {
    randomUuid: () => Effect.Effect<string>;
    unitNumbers?: readonly number[];
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

  const allEpisodes = options?.unitNumbers?.length ? options.unitNumbers : [unitNumber];
  const importPlan = yield* buildLibraryFileWritePlan({
    animeRow,
    unitNumbers: allEpisodes,
    sourcePath,
    ...(options.namingFormat === undefined ? {} : { namingFormat: options.namingFormat }),
    ...(options.preferredTitle === undefined ? {} : { preferredTitle: options.preferredTitle }),
    ...(options.episodeRows === undefined ? {} : { episodeRows: options.episodeRows }),
    ...(options.downloadSourceMetadata === undefined
      ? {}
      : { downloadSourceMetadata: options.downloadSourceMetadata }),
    ...(options.localMediaMetadata === undefined
      ? {}
      : { localMediaMetadata: options.localMediaMetadata }),
    ...(options.season === undefined ? {} : { season: options.season }),
  });
  const tempDestination = `${importPlan.destination}.tmp.${yield* options.randomUuid()}`;
  const backupDestination = `${importPlan.destination}.bak.${yield* options.randomUuid()}`;

  yield* fs.mkdir(animeRow.rootFolder, { recursive: true });
  yield* Effect.acquireUseRelease(
    stageSourceIntoTempFile({
      fs,
      importMode,
      sourcePath,
      tempDestination,
    }).pipe(Effect.as(tempDestination)),
    (tempDestination) =>
      replaceDestinationWithStagedFile({
        backupDestination,
        destination: importPlan.destination,
        fs,
        tempDestination,
      }),
    (tempDestination) => cleanupStagedTempFile(fs, tempDestination),
  );

  return importPlan.destination;
});

export const stageSourceIntoTempFile = Effect.fn("Operations.stageSourceIntoTempFile")(
  function* (input: {
    readonly fs: FileSystemShape;
    readonly importMode: ImportMode;
    readonly sourcePath: string;
    readonly tempDestination: string;
  }) {
    const stageResult = yield* Effect.either(
      input.importMode === "copy"
        ? input.fs.copyFile(input.sourcePath, input.tempDestination)
        : input.fs
            .rename(input.sourcePath, input.tempDestination)
            .pipe(
              Effect.catchTag("FileSystemError", (error) =>
                isCrossFilesystemError(error)
                  ? stageMoveAcrossFilesystems(input.fs, input.sourcePath, input.tempDestination)
                  : Effect.fail(error),
              ),
            ),
    );

    if (stageResult._tag === "Right") {
      return;
    }

    const cleanupResult = yield* Effect.either(
      removeStagedTempFileStrict(input.fs, input.tempDestination),
    );

    if (cleanupResult._tag === "Left") {
      return yield* new ImportFileError({
        message: `Failed to ${input.importMode} file to temp destination and cleanup temp file`,
        cause: Cause.sequential(Cause.fail(stageResult.left), Cause.fail(cleanupResult.left)),
      });
    }

    return yield* new ImportFileError({
      message: `Failed to ${input.importMode} file to temp destination`,
      cause: stageResult.left,
    });
  },
);

export function cleanupStagedTempFile(fs: FileSystemShape, tempDestination: string) {
  return removeStagedTempFileStrict(fs, tempDestination).pipe(
    Effect.catchTag("FileSystemError", (error) =>
      Effect.logWarning("Failed to clean up staged temp file").pipe(
        Effect.annotateLogs({
          error: String(error),
          temp_path: tempDestination,
        }),
        Effect.asVoid,
      ),
    ),
  );
}

export const replaceDestinationWithStagedFile = Effect.fn(
  "Operations.replaceDestinationWithStagedFile",
)(function* (input: {
  readonly backupDestination: string;
  readonly destination: string;
  readonly fs: FileSystemShape;
  readonly tempDestination: string;
}) {
  const hasExistingDestination = yield* hasExistingFile(input.fs, input.destination);

  if (!hasExistingDestination) {
    yield* input.fs.rename(input.tempDestination, input.destination).pipe(
      Effect.mapError(
        (cause) =>
          new ImportFileError({
            message: "Failed to rename temp file to destination",
            cause,
          }),
      ),
    );
    return;
  }

  yield* input.fs.rename(input.destination, input.backupDestination).pipe(
    Effect.mapError(
      (cause) =>
        new ImportFileError({
          message: "Failed to back up existing destination",
          cause,
        }),
    ),
  );

  const commitResult = yield* Effect.either(
    input.fs.rename(input.tempDestination, input.destination),
  );

  if (commitResult._tag === "Right") {
    yield* input.fs.remove(input.backupDestination).pipe(
      Effect.catchTag("FileSystemError", (error) =>
        Effect.logWarning("Failed to remove backup file after successful import").pipe(
          Effect.annotateLogs({
            backup_path: input.backupDestination,
            error: String(error),
          }),
          Effect.asVoid,
        ),
      ),
    );
    return;
  }

  const restoreResult = yield* Effect.either(
    input.fs.rename(input.backupDestination, input.destination),
  );

  if (restoreResult._tag === "Left") {
    yield* Effect.logError("Failed to restore backup after rename failure").pipe(
      Effect.annotateLogs({
        backup_path: input.backupDestination,
        destination_path: input.destination,
        error: String(restoreResult.left),
      }),
    );

    return yield* new ImportFileError({
      message: "Failed to rename temp file to destination and restore backup",
      cause: Cause.sequential(Cause.fail(commitResult.left), Cause.fail(restoreResult.left)),
    });
  }

  return yield* new ImportFileError({
    message: "Failed to rename temp file to destination",
    cause: commitResult.left,
  });
});

export const writeLibraryImportFile = Effect.fn("Operations.writeLibraryImportFile")((input: {
  readonly mediaUnitRepository: MediaUnitRepositoryShape;
  readonly fs: FileSystemShape;
  readonly plan: {
    readonly allEpisodeNumbers: readonly number[];
    readonly animeRow: typeof media.$inferSelect;
    readonly destination: string;
    readonly importMode: ImportMode;
    readonly namingPlan: UnitFilenamePlan;
    readonly resolvedSource: string;
    readonly sourcePath: string;
    readonly unitNumber: number;
  };
}): Effect.Effect<
  ImportResult["imported_files"][number],
  DomainPathError | InfrastructureError
> => {
  const { mediaUnitRepository, fs, plan } = input;
  return Effect.gen(function* () {
    if (plan.importMode === "move") {
      yield* fs.rename(plan.resolvedSource, plan.destination).pipe(
        Effect.mapError(
          (cause) =>
            new DomainPathError({
              cause,
              message: `Failed to move file into library: ${plan.sourcePath}`,
            }),
        ),
      );
    } else {
      yield* fs.copyFile(plan.resolvedSource, plan.destination).pipe(
        Effect.mapError(
          (cause) =>
            new DomainPathError({
              cause,
              message: `Failed to copy file into library: ${plan.sourcePath}`,
            }),
        ),
      );
    }

    const dbResult = yield* mediaUnitRepository
      .upsertUnitFiles(plan.animeRow.id, plan.allEpisodeNumbers, plan.destination)
      .pipe(
        Effect.mapError(
          (cause) =>
            new InfrastructureError({
              cause,
              message: "Failed to import episode files atomically",
            }),
        ),
        Effect.either,
      );

    if (Either.isLeft(dbResult)) {
      const rollbackEffect =
        plan.importMode === "move"
          ? fs.rename(plan.destination, plan.resolvedSource)
          : fs.remove(plan.destination);

      yield* rollbackEffect.pipe(
        Effect.catchTag("FileSystemError", (error) =>
          Effect.logWarning("Failed to rollback filesystem after import error").pipe(
            Effect.annotateLogs({
              destination_path: plan.destination,
              source_path: plan.sourcePath,
              error: String(error),
            }),
          ),
        ),
      );

      return yield* dbResult.left;
    }

    return {
      media_id: brandMediaId(plan.animeRow.id),
      destination_path: plan.destination,
      unit_number: plan.unitNumber,
      unit_numbers: plan.allEpisodeNumbers.length > 1 ? [...plan.allEpisodeNumbers] : undefined,
      naming_fallback_used: plan.namingPlan.fallbackUsed || undefined,
      naming_format_used: plan.namingPlan.formatUsed,
      naming_metadata_snapshot: plan.namingPlan.metadataSnapshot,
      naming_missing_fields:
        plan.namingPlan.missingFields.length > 0 ? [...plan.namingPlan.missingFields] : undefined,
      naming_warnings:
        plan.namingPlan.warnings.length > 0 ? [...plan.namingPlan.warnings] : undefined,
      source_path: plan.sourcePath,
    } satisfies ImportResult["imported_files"][number];
  });
});

const stageMoveAcrossFilesystems = Effect.fn("Operations.stageMoveAcrossFilesystems")(function* (
  fs: FileSystemShape,
  sourcePath: string,
  tempDestination: string,
) {
  yield* fs.copyFile(sourcePath, tempDestination);
  const removeResult = yield* Effect.either(fs.remove(sourcePath));

  if (removeResult._tag === "Right") {
    return;
  }

  const cleanupResult = yield* Effect.either(removeStagedTempFileStrict(fs, tempDestination));

  if (cleanupResult._tag === "Left") {
    return yield* Effect.failCause(
      Cause.sequential(Cause.fail(removeResult.left), Cause.fail(cleanupResult.left)),
    );
  }

  return yield* removeResult.left;
});

const hasExistingFile = Effect.fn("Operations.hasExistingImportDestination")(function* (
  fs: FileSystemShape,
  destination: string,
) {
  return yield* fs.stat(destination).pipe(
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
});

function removeStagedTempFileStrict(fs: FileSystemShape, tempDestination: string) {
  return fs
    .remove(tempDestination)
    .pipe(
      Effect.catchTag("FileSystemError", (error) =>
        isNotFoundError(error) ? Effect.void : Effect.fail(error),
      ),
    );
}
