import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { classifyMediaArtifact } from "@/infra/media/identity/identity.ts";
import { extractUnitNumbersFromFile } from "@/features/media/files/files.ts";
import { upsertEpisodeFilesAtomic } from "@/features/operations/download/download-unit-upsert-support.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";

export interface LibraryScanCounts {
  readonly matchedFiles: number;
  readonly scannedFiles: number;
}

export const countLibraryScanFile = Effect.fn("OperationsService.countLibraryScanFile")(function* (
  db: AppDatabase,
  input: {
    mediaId: number;
    mediaKind: string;
    counts: LibraryScanCounts;
    file: { readonly name: string; readonly path: string };
  },
) {
  const classification = classifyMediaArtifact(input.file.path, input.file.name);
  if (classification.kind === "extra" || classification.kind === "sample") {
    return {
      matchedFiles: input.counts.matchedFiles,
      scannedFiles: input.counts.scannedFiles + 1,
    } satisfies LibraryScanCounts;
  }

  const isVolumeMedia = input.mediaKind !== "anime";
  const unitNumbers = extractUnitNumbersFromFile(input.file.name, input.file.path, isVolumeMedia);
  if (unitNumbers.length === 0) {
    return {
      matchedFiles: input.counts.matchedFiles,
      scannedFiles: input.counts.scannedFiles + 1,
    } satisfies LibraryScanCounts;
  }

  yield* upsertEpisodeFilesAtomic(db, input.mediaId, unitNumbers, input.file.path).pipe(
    Effect.mapError(
      (cause) =>
        new OperationsInfrastructureError({
          message: "Failed to run library scan",
          cause,
        }),
    ),
  );

  return {
    matchedFiles: input.counts.matchedFiles + unitNumbers.length,
    scannedFiles: input.counts.scannedFiles + 1,
  } satisfies LibraryScanCounts;
});
