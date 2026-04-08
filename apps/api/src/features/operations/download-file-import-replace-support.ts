import { Effect } from "effect";

import { ImportFileError } from "@/features/operations/download-file-import-errors.ts";
import { isNotFoundError } from "@/lib/fs-errors.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";

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

  yield* input.fs.rename(input.backupDestination, input.destination).pipe(
    Effect.catchTag("FileSystemError", (error) =>
      Effect.logWarning("Failed to restore backup after rename failure").pipe(
        Effect.annotateLogs({
          backup_path: input.backupDestination,
          destination_path: input.destination,
          error: String(error),
        }),
        Effect.asVoid,
      ),
    ),
  );

  return yield* new ImportFileError({
    message: "Failed to rename temp file to destination",
    cause: commitResult.left,
  });
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
