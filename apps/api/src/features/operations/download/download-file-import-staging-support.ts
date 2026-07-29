// oxlint-disable typescript-eslint/consistent-return
import { Cause, Effect } from "effect";

import type { ImportMode } from "@packages/shared/index.ts";
import { ImportFileError } from "@/features/operations/download/download-file-import-errors.ts";
import { isCrossFilesystemError, isNotFoundError } from "@/infra/filesystem/fs-errors.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";

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
          error: String(error),
          temp_path: tempDestination,
        }),
        Effect.asVoid,
      ),
    ),
  );
}

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

function removeStagedTempFileStrict(fs: FileSystemShape, tempDestination: string) {
  return fs
    .remove(tempDestination)
    .pipe(
      Effect.catchTag("FileSystemError", (error) =>
        isNotFoundError(error) ? Effect.void : Effect.fail(error),
      ),
    );
}
