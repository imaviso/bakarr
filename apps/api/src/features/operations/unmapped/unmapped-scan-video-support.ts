import { Effect, Stream } from "effect";

import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { DomainPathError } from "@/features/errors.ts";
import { scanVideoFilesStream } from "@/features/operations/import-scan/file-scanner.ts";

export const loadUnmappedFolderVideoSize = Effect.fn(
  "OperationsService.loadUnmappedFolderVideoSize",
)(function* (fs: FileSystemShape, path: string) {
  return yield* Stream.runFold(
    scanVideoFilesStream(fs, path),
    0,
    (total, file) => total + file.size,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new DomainPathError({
          cause,
          message: `Unmapped folder is inaccessible: ${path}`,
        }),
    ),
  );
});
