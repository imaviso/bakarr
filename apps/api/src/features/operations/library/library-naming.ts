// oxlint-disable typescript-eslint/consistent-return

import { Cause, Context, Effect, Layer, Result } from "effect";
import type { DownloadSourceMetadata, PreferredTitle } from "@packages/shared/index.ts";

import { DomainPathError } from "@/features/errors.ts";
import { ImportFileError } from "@/features/operations/download/download-file-import-errors.ts";
import { buildUnitFilenamePlan } from "@/features/operations/library/naming-canonical-support.ts";
import { hasMissingLocalMediaNamingFields } from "@/features/operations/library/naming-format-support.ts";
import type { UnitFilenamePlan } from "@/features/operations/library/naming-types.ts";
import {
  findExistingAncestorPath,
  resolveConfiguredLibraryRoot,
} from "@/features/media/shared/media-path-policy.ts";
import { isCrossFilesystemError, isNotFoundError } from "@/infra/filesystem/fs-errors.ts";
import {
  FileSystem,
  isWithinPathRoot,
  MAX_FILENAME_BYTES,
  STAGING_SUFFIX_RESERVE_BYTES,
  truncateFilenameToByteLimit,
  type FileSystemError,
  type FileSystemShape,
} from "@/infra/filesystem/filesystem.ts";
import { pathBasename, pathExtension } from "@/infra/path.ts";
import {
  MediaProbe,
  probeMediaMetadataOrUndefined,
  type ProbedMediaMetadata,
} from "@/infra/media/probe.ts";
import { RandomService } from "@/infra/random.ts";

export interface LibraryNamingMedia {
  readonly titleRomaji: string;
  readonly titleEnglish?: string | null;
  readonly titleNative?: string | null;
  readonly format: string;
  readonly rootFolder: string;
  readonly startDate?: string | null;
  readonly startYear?: number | null;
  readonly endDate?: string | null;
  readonly endYear?: number | null;
}

export interface LibraryNamingRequest {
  readonly media: LibraryNamingMedia;
  readonly unitNumbers: readonly number[];
  readonly sourcePath: string;
  readonly namingFormat?: string;
  readonly preferredTitle?: PreferredTitle;
  readonly episodeRows?: readonly { title?: string | null; aired?: string | null }[];
  readonly downloadSourceMetadata?: DownloadSourceMetadata;
  readonly localMediaMetadata?: ProbedMediaMetadata;
  readonly season?: number;
}

export interface PlacedLibraryFile {
  readonly destination: string;
  readonly filename: string;
  readonly plan: UnitFilenamePlan;
}

export function toLibraryNamingMedia(row: {
  readonly titleRomaji: string;
  readonly titleEnglish?: string | null;
  readonly titleNative?: string | null;
  readonly format: string;
  readonly rootFolder: string;
  readonly startDate?: string | null;
  readonly startYear?: number | null;
  readonly endDate?: string | null;
  readonly endYear?: number | null;
}): LibraryNamingMedia {
  return {
    ...(row.endDate === undefined ? {} : { endDate: row.endDate }),
    ...(row.endYear === undefined ? {} : { endYear: row.endYear }),
    format: row.format,
    rootFolder: row.rootFolder,
    ...(row.startDate === undefined ? {} : { startDate: row.startDate }),
    ...(row.startYear === undefined ? {} : { startYear: row.startYear }),
    ...(row.titleEnglish === undefined ? {} : { titleEnglish: row.titleEnglish }),
    ...(row.titleNative === undefined ? {} : { titleNative: row.titleNative }),
    titleRomaji: row.titleRomaji,
  };
}

export interface LibraryNamingShape {
  readonly preview: (
    request: LibraryNamingRequest,
  ) => Effect.Effect<PlacedLibraryFile, DomainPathError>;
  readonly placeFile: (
    request: LibraryNamingRequest,
    options: { readonly importMode: "copy" | "move" },
  ) => Effect.Effect<PlacedLibraryFile, DomainPathError | ImportFileError | FileSystemError>;
}

export const makeLibraryNaming = Effect.fn("LibraryNaming.make")(function* () {
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;
  const random = yield* RandomService;

  const preview = Effect.fn("LibraryNaming.preview")(function* (request: LibraryNamingRequest) {
    if (request.unitNumbers.length === 0) {
      return yield* new DomainPathError({ message: "Library naming requires unit numbers" });
    }
    const plan = buildPlan(request, request.localMediaMetadata);
    return yield* buildDestination(fs, request.media.rootFolder, request.sourcePath, plan);
  });

  const placeFile = Effect.fn("LibraryNaming.placeFile")(function* (
    request: LibraryNamingRequest,
    options: { readonly importMode: "copy" | "move" },
  ) {
    if (request.unitNumbers.length === 0) {
      return yield* new DomainPathError({ message: "Library naming requires unit numbers" });
    }
    let plan = buildPlan(request, request.localMediaMetadata);
    if (
      request.localMediaMetadata === undefined &&
      hasMissingLocalMediaNamingFields(plan.missingFields)
    ) {
      const probed = yield* probeMediaMetadataOrUndefined(mediaProbe, request.sourcePath);
      if (probed) {
        plan = buildPlan(request, probed);
      }
    }
    const placed = yield* buildDestination(fs, request.media.rootFolder, request.sourcePath, plan);
    if (request.sourcePath === placed.destination) {
      return placed;
    }
    yield* writeImportedFileAtomically({
      destination: placed.destination,
      destinationRoot: request.media.rootFolder,
      fs,
      importMode: options.importMode,
      randomUuid: () => random.randomUuid,
      sourcePath: request.sourcePath,
    });
    return placed;
  });

  return { preview, placeFile } satisfies LibraryNamingShape;
});

export class LibraryNaming extends Context.Service<LibraryNaming, LibraryNamingShape>()(
  "@bakarr/api/LibraryNaming",
) {
  static readonly layer = Layer.effect(LibraryNaming, makeLibraryNaming());
}

export const LibraryNamingLive = LibraryNaming.layer;

function buildPlan(
  request: LibraryNamingRequest,
  localMediaMetadata: ProbedMediaMetadata | undefined,
): UnitFilenamePlan {
  return buildUnitFilenamePlan({
    animeRow: {
      ...(request.media.endDate === undefined ? {} : { endDate: request.media.endDate }),
      ...(request.media.endYear === undefined ? {} : { endYear: request.media.endYear }),
      format: request.media.format,
      rootFolder: request.media.rootFolder,
      ...(request.media.startDate === undefined ? {} : { startDate: request.media.startDate }),
      ...(request.media.startYear === undefined ? {} : { startYear: request.media.startYear }),
      ...(request.media.titleEnglish === undefined
        ? {}
        : { titleEnglish: request.media.titleEnglish }),
      ...(request.media.titleNative === undefined
        ? {}
        : { titleNative: request.media.titleNative }),
      titleRomaji: request.media.titleRomaji,
    },
    unitNumbers: request.unitNumbers,
    filePath: request.sourcePath,
    ...(request.namingFormat === undefined ? {} : { namingFormat: request.namingFormat }),
    preferredTitle: request.preferredTitle ?? "romaji",
    ...(request.episodeRows === undefined ? {} : { episodeRows: request.episodeRows }),
    ...(request.downloadSourceMetadata === undefined
      ? {}
      : { downloadSourceMetadata: request.downloadSourceMetadata }),
    ...(localMediaMetadata === undefined ? {} : { localMediaMetadata }),
    ...(request.season === undefined ? {} : { season: request.season }),
  });
}

const buildDestination = Effect.fn("LibraryNaming.buildDestination")(function* (
  fs: FileSystemShape,
  rootFolder: string,
  sourcePath: string,
  plan: UnitFilenamePlan,
) {
  const extension = pathExtension(sourcePath, ".mkv");
  const baseName = truncateFilenameToByteLimit(
    plan.baseName,
    MAX_FILENAME_BYTES - Buffer.byteLength(extension, "utf8"),
  );
  const filename = `${baseName}${extension}`;
  const destination = `${rootFolder.replace(/\/$/, "")}/${filename}`;

  if (!isWithinPathRoot(destination, rootFolder)) {
    return yield* new DomainPathError({
      message: `Resolved destination escapes the media root folder: ${destination}`,
    });
  }
  const resolvedRoot = yield* resolveConfiguredLibraryRoot(fs, rootFolder);
  const canonicalParent = yield* findExistingAncestorPath(fs, destination).pipe(
    Effect.mapError((cause) =>
      cause instanceof DomainPathError
        ? cause
        : new DomainPathError({
            cause,
            message: `Resolved destination escapes the media root folder: ${destination}`,
          }),
    ),
  );
  if (!isWithinPathRoot(canonicalParent, resolvedRoot)) {
    return yield* new DomainPathError({
      message: `Resolved destination escapes the media root folder: ${destination}`,
    });
  }

  return { destination, filename, plan } satisfies PlacedLibraryFile;
});

const writeImportedFileAtomically = Effect.fn("LibraryNaming.writeImportedFileAtomically")(
  function* (input: {
    readonly destination: string;
    readonly destinationRoot: string;
    readonly fs: FileSystemShape;
    readonly importMode: "copy" | "move";
    readonly randomUuid: () => Effect.Effect<string>;
    readonly sourcePath: string;
  }) {
    const suffix = yield* input.randomUuid();
    const destinationName = pathBasename(input.destination);
    const stagingId =
      Buffer.byteLength(destinationName, "utf8") + 5 + 36 >
      MAX_FILENAME_BYTES + STAGING_SUFFIX_RESERVE_BYTES
        ? suffix.slice(0, 8)
        : suffix;
    const tempDestination = `${input.destination}.tmp.${stagingId}`;
    const backupDestination = `${input.destination}.bak.${stagingId}`;

    yield* input.fs.mkdir(input.destinationRoot, { recursive: true });
    yield* Effect.acquireUseRelease(
      stageSourceIntoTempFile({
        fs: input.fs,
        importMode: input.importMode,
        sourcePath: input.sourcePath,
        tempDestination,
      }).pipe(Effect.as(tempDestination)),
      (staged) =>
        replaceDestinationWithStagedFile({
          backupDestination,
          destination: input.destination,
          fs: input.fs,
          tempDestination: staged,
        }),
      (staged) => cleanupStagedTempFile(input.fs, staged),
    );
  },
);

const stageSourceIntoTempFile = Effect.fn("LibraryNaming.stageSourceIntoTempFile")(
  function* (input: {
    readonly fs: FileSystemShape;
    readonly importMode: "copy" | "move";
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

    if (Result.isSuccess(stageResult)) {
      return;
    }

    const cleanupResult = yield* Effect.result(
      removeStagedTempFileStrict(input.fs, input.tempDestination),
    );

    if (Result.isFailure(cleanupResult)) {
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
    Effect.catchTag("FileSystemError", () =>
      Effect.logWarning("Failed to clean up staged temp file").pipe(
        Effect.annotateLogs({ temp_path: tempDestination }),
        Effect.asVoid,
      ),
    ),
  );
}

const replaceDestinationWithStagedFile = Effect.fn(
  "LibraryNaming.replaceDestinationWithStagedFile",
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

  if (Result.isSuccess(commitResult)) {
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

  if (Result.isFailure(restoreResult)) {
    yield* Effect.logError("Failed to restore backup after rename failure").pipe(
      Effect.annotateLogs({
        backup_path: input.backupDestination,
        destination_path: input.destination,
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

const stageMoveAcrossFilesystems = Effect.fn("LibraryNaming.stageMoveAcrossFilesystems")(function* (
  fs: FileSystemShape,
  sourcePath: string,
  tempDestination: string,
) {
  yield* fs.copyFile(sourcePath, tempDestination);
  const removeResult = yield* Effect.result(fs.remove(sourcePath));

  if (Result.isSuccess(removeResult)) {
    return;
  }

  const cleanupResult = yield* Effect.result(removeStagedTempFileStrict(fs, tempDestination));

  if (Result.isFailure(cleanupResult)) {
    return yield* Effect.failCause(
      Cause.combine(Cause.fail(removeResult.failure), Cause.fail(cleanupResult.failure)),
    );
  }

  return yield* removeResult.failure;
});

const hasExistingFile = Effect.fn("LibraryNaming.hasExistingImportDestination")(function* (
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
