import { Effect } from "effect";

import type { ImportMode } from "@packages/shared/index.ts";
import { ImportFileError } from "@/features/operations/download-file-import-errors.ts";
import { isCrossFilesystemError, isNotFoundError } from "@/lib/fs-errors.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";

export const stageSourceIntoTempFile = Effect.fn("Operations.stageSourceIntoTempFile")(
  function* (input: {
    readonly fs: FileSystemShape;
    readonly importMode: ImportMode;
    readonly sourcePath: string;
    readonly tempDestination: string;
  }) {
    if (input.importMode === "copy") {
      return yield* input.fs.copyFile(input.sourcePath, input.tempDestination).pipe(
        Effect.mapError(
          (cause) =>
            new ImportFileError({
              message: `Failed to ${input.importMode} file to temp destination`,
              cause,
            }),
        ),
      );
    }

    return yield* input.fs.rename(input.sourcePath, input.tempDestination).pipe(
      Effect.catchTag("FileSystemError", (error) =>
        isCrossFilesystemError(error)
          ? stageMoveAcrossFilesystems(input.fs, input.sourcePath, input.tempDestination)
          : Effect.fail(error),
      ),
      Effect.mapError(
        (cause) =>
          new ImportFileError({
            message: `Failed to ${input.importMode} file to temp destination`,
            cause,
          }),
      ),
    );
  },
);

export function cleanupStagedTempFile(fs: FileSystemShape, tempDestination: string) {
  return fs.remove(tempDestination).pipe(
    Effect.catchTag("FileSystemError", (error) =>
      isNotFoundError(error)
        ? Effect.void
        : Effect.logWarning("Failed to clean up staged temp file").pipe(
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
  const removeResult = yield* Effect.either(fs.remove(sourcePath));

  if (removeResult._tag === "Right") {
    return;
  }

  yield* cleanupStagedTempFile(fs, tempDestination);
  return yield* removeResult.left;
});
