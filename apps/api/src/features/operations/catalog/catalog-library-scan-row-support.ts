import { Effect, Stream } from "effect";

import { media } from "@/db/schema.ts";
import { DomainPathError } from "@/features/errors.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";
import { scanVideoFilesStream } from "@/features/operations/import-scan/file-scanner.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import {
  countLibraryScanFile,
  type LibraryScanCounts,
} from "@/features/operations/catalog/catalog-library-scan-file-support.ts";

export const scanMediaLibraryRow = Effect.fn("CatalogScanRow.scanMediaLibraryRow")(function* (
  mediaUnitRepository: MediaUnitRepositoryShape,
  fs: FileSystemShape,
  animeRow: typeof media.$inferSelect,
) {
  return yield* scanVideoFilesStream(fs, animeRow.rootFolder).pipe(
    Stream.mapError(
      () =>
        new DomainPathError({
          message: `Media library folder is inaccessible: ${animeRow.rootFolder}`,
        }),
    ),
    Stream.runFoldEffect(
      { matchedFiles: 0, scannedFiles: 0 } satisfies LibraryScanCounts,
      (counts, file) =>
        countLibraryScanFile(mediaUnitRepository, {
          mediaId: animeRow.id,
          mediaKind: animeRow.mediaKind,
          counts,
          file,
        }),
    ),
  );
});
