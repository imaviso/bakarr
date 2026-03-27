import { Effect } from "effect";

import type { FileSystemShape } from "../../lib/filesystem.ts";
import { OperationsPathError } from "./errors.ts";
import { scanVideoFiles } from "./file-scanner.ts";

export const loadUnmappedFolderVideoSize = Effect.fn(
  "OperationsService.loadUnmappedFolderVideoSize",
)(function* (fs: FileSystemShape, path: string) {
  const files = yield* scanVideoFiles(fs, path).pipe(
    Effect.mapError(
      () =>
        new OperationsPathError({
          message: `Unmapped folder is inaccessible: ${path}`,
        }),
    ),
  );

  return files.reduce((total, file) => total + file.size, 0);
});
