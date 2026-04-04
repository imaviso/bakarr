import { Effect } from "effect";

import type { FileSystemShape } from "@/lib/filesystem.ts";
import { OperationsPathError } from "@/features/operations/errors.ts";
import { scanVideoFiles } from "@/features/operations/file-scanner.ts";

export const loadUnmappedFolderVideoSize = Effect.fn(
  "OperationsService.loadUnmappedFolderVideoSize",
)(function* (fs: FileSystemShape, path: string) {
  const files = yield* scanVideoFiles(fs, path).pipe(
    Effect.mapError(
      (cause) =>
        new OperationsPathError({
          cause,
          message: `Unmapped folder is inaccessible: ${path}`,
        }),
    ),
  );

  return files.reduce((total, file) => total + file.size, 0);
});
