// oxlint-disable typescript-eslint/consistent-return

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
import type { FileSystemError } from "@/infra/filesystem/filesystem.ts";
import { isCrossFilesystemError, isNotFoundError } from "@/infra/filesystem/fs-errors.ts";
import { isWithinPathRoot, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { pathExtension } from "@/infra/path.ts";
import {
  probeMediaMetadataOrUndefined,
  type MediaProbeShape,
  type ProbedMediaMetadata,
} from "@/infra/media/probe.ts";
import { buildUnitFilenamePlan } from "@/features/operations/library/naming-canonical-support.ts";
import { hasMissingLocalMediaNamingFields } from "@/features/operations/library/naming-format-support.ts";
import type { UnitFilenamePlan } from "@/features/operations/library/naming-types.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";
import { Cause, Effect, Result } from "effect";

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
    const extension = pathExtension(input.sourcePath, ".mkv");
    const preferredTitle = input.preferredTitle ?? "romaji";
    let namingPlan = buildNamingPlan(input, preferredTitle, input.localMediaMetadata);

    if (input.mediaProbe) {
      const localMediaMetadata = yield* probeMissingNamingMetadata(
        input.mediaProbe,
        input.sourcePath,
        namingPlan.missingFields,
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

/**
 * Shared naming→probe fallback: probe the file for local media metadata only
 * when the naming plan is missing heuristic fields. Callers feed the result
 * back into plan building / import options.
 */
export const probeMissingNamingMetadata = Effect.fn("Operations.probeMissingNamingMetadata")(
  function* (mediaProbe: MediaProbeShape, filePath: string, missingFields: readonly string[]) {
    if (!hasMissingLocalMediaNamingFields(missingFields)) {
      return undefined;
    }

    return yield* probeMediaMetadataOrUndefined(mediaProbe, filePath);
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

  yield* writeImportedFileAtomically({
    destination: importPlan.destination,
    destinationRoot: animeRow.rootFolder,
    fs,
    importMode,
    randomUuid: options.randomUuid,
    sourcePath,
  });

  return importPlan.destination;
});

/**
 * Atomic library write shared by every import path: stage the source into a
 * temp file, then swap it in via backup + rename. An existing destination is
 * backed up first and restored when the commit rename fails; the staged temp
 * file is always cleaned up.
 */
export const writeImportedFileAtomically = Effect.fn("Operations.writeImportedFileAtomically")(
  function* (input: {
    readonly destination: string;
    readonly destinationRoot: string;
    readonly fs: FileSystemShape;
    readonly importMode: ImportMode;
    readonly randomUuid: () => Effect.Effect<string>;
    readonly sourcePath: string;
  }) {
    const tempDestination = `${input.destination}.tmp.${yield* input.randomUuid()}`;
    const backupDestination = `${input.destination}.bak.${yield* input.randomUuid()}`;

    yield* input.fs.mkdir(input.destinationRoot, { recursive: true });
    yield* Effect.acquireUseRelease(
      stageSourceIntoTempFile({
        fs: input.fs,
        importMode: input.importMode,
        sourcePath: input.sourcePath,
        tempDestination,
      }).pipe(Effect.as(tempDestination)),
      (tempDestination) =>
        replaceDestinationWithStagedFile({
          backupDestination,
          destination: input.destination,
          fs: input.fs,
          tempDestination,
        }),
      (tempDestination) => cleanupStagedTempFile(input.fs, tempDestination),
    );
  },
);

export const stageSourceIntoTempFile = Effect.fn("Operations.stageSourceIntoTempFile")(
  function* (input: {
    readonly fs: FileSystemShape;
    readonly importMode: ImportMode;
    readonly sourcePath: string;
    readonly tempDestination: string;
  }) {
    const stageResult = yield* Effect.result(
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

    if (stageResult._tag === "Success") {
      return;
    }

    const cleanupResult = yield* Effect.result(
      removeStagedTempFileStrict(input.fs, input.tempDestination),
    );

    if (cleanupResult._tag === "Failure") {
      return yield* new ImportFileError({
        message: `Failed to ${input.importMode} file to temp destination and cleanup temp file`,
        cause: Cause.combine(Cause.fail(stageResult.failure), Cause.fail(cleanupResult.failure)),
      });
    }

    return yield* new ImportFileError({
      message: `Failed to ${input.importMode} file to temp destination`,
      cause: stageResult.failure,
    });
  },
);

export function cleanupStagedTempFile(fs: FileSystemShape, tempDestination: string) {
  return removeStagedTempFileStrict(fs, tempDestination).pipe(
    Effect.catchTag("FileSystemError", (error) =>
      Effect.logWarning("Failed to clean up staged temp file").pipe(
        Effect.annotateLogs({
          error: globalThis.String(error),
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

  const commitResult = yield* Effect.result(
    input.fs.rename(input.tempDestination, input.destination),
  );

  if (commitResult._tag === "Success") {
    yield* input.fs.remove(input.backupDestination).pipe(
      Effect.catchTag("FileSystemError", (error) =>
        Effect.logWarning("Failed to remove backup file after successful import").pipe(
          Effect.annotateLogs({
            backup_path: input.backupDestination,
            error: globalThis.String(error),
          }),
          Effect.asVoid,
        ),
      ),
    );
    return;
  }

  const restoreResult = yield* Effect.result(
    input.fs.rename(input.backupDestination, input.destination),
  );

  if (restoreResult._tag === "Failure") {
    yield* Effect.logError("Failed to restore backup after rename failure").pipe(
      Effect.annotateLogs({
        backup_path: input.backupDestination,
        destination_path: input.destination,
        error: globalThis.String(restoreResult.failure),
      }),
    );

    return yield* new ImportFileError({
      message: "Failed to rename temp file to destination and restore backup",
      cause: Cause.combine(Cause.fail(commitResult.failure), Cause.fail(restoreResult.failure)),
    });
  }

  return yield* new ImportFileError({
    message: "Failed to rename temp file to destination",
    cause: commitResult.failure,
  });
});

export const writeLibraryImportFile = Effect.fn("Operations.writeLibraryImportFile")((input: {
  readonly mediaUnitRepository: MediaUnitRepositoryShape;
  readonly fs: FileSystemShape;
  readonly randomUuid: () => Effect.Effect<string>;
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
  DomainPathError | InfrastructureError | ImportFileError | FileSystemError
> => {
  const { mediaUnitRepository, fs, plan } = input;
  return Effect.gen(function* () {
    // Same staged → backup → atomic-rename write as the download import path;
    // never a bare rename/copy onto the destination.
    yield* writeImportedFileAtomically({
      destination: plan.destination,
      destinationRoot: plan.animeRow.rootFolder,
      fs,
      importMode: plan.importMode,
      randomUuid: input.randomUuid,
      sourcePath: plan.resolvedSource,
    });

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
        Effect.result,
      );

    if (Result.isFailure(dbResult)) {
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
              error: globalThis.String(error),
            }),
          ),
        ),
      );

      return yield* dbResult.failure;
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
  const removeResult = yield* Effect.result(fs.remove(sourcePath));

  if (removeResult._tag === "Success") {
    return;
  }

  const cleanupResult = yield* Effect.result(removeStagedTempFileStrict(fs, tempDestination));

  if (cleanupResult._tag === "Failure") {
    return yield* Effect.failCause(
      Cause.combine(Cause.fail(removeResult.failure), Cause.fail(cleanupResult.failure)),
    );
  }

  return yield* removeResult.failure;
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
