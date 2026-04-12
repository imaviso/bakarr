import { Effect, Stream } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { OperationsPathError } from "@/features/operations/errors.ts";
import { scanVideoFilesStream } from "@/features/operations/file-scanner.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import {
  countLibraryScanFile,
  type LibraryScanCounts,
} from "@/features/operations/catalog-library-scan-file-support.ts";

export const scanAnimeLibraryRow = Effect.fn("OperationsService.scanAnimeLibraryRow")(function* (
  db: AppDatabase,
  fs: FileSystemShape,
  animeRow: typeof anime.$inferSelect,
) {
  return yield* scanVideoFilesStream(fs, animeRow.rootFolder).pipe(
    Stream.mapError(
      () =>
        new OperationsPathError({
          message: `Anime library folder is inaccessible: ${animeRow.rootFolder}`,
        }),
    ),
    Stream.runFoldEffect(
      { matchedFiles: 0, scannedFiles: 0 } satisfies LibraryScanCounts,
      (counts, file) => countLibraryScanFile(db, { animeId: animeRow.id, counts, file }),
    ),
  );
});
