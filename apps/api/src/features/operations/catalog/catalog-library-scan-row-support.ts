import { Effect, Stream } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { OperationsPathError } from "@/features/operations/errors.ts";
import { scanVideoFilesStream } from "@/features/operations/import-scan/file-scanner.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import {
  countLibraryScanFile,
  type LibraryScanCounts,
} from "@/features/operations/catalog/catalog-library-scan-file-support.ts";

export const scanAnimeLibraryRow = Effect.fn("OperationsService.scanAnimeLibraryRow")(function* (
  db: AppDatabase,
  fs: FileSystemShape,
  animeRow: typeof media.$inferSelect,
) {
  return yield* scanVideoFilesStream(fs, animeRow.rootFolder).pipe(
    Stream.mapError(
      () =>
        new OperationsPathError({
          message: `Media library folder is inaccessible: ${animeRow.rootFolder}`,
        }),
    ),
    Stream.runFoldEffect(
      { matchedFiles: 0, scannedFiles: 0 } satisfies LibraryScanCounts,
      (counts, file) => countLibraryScanFile(db, { mediaId: animeRow.id, counts, file }),
    ),
  );
});
