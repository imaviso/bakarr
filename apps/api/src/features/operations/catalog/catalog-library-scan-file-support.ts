import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { classifyMediaArtifact, parseFileSourceIdentity } from "@/infra/media/identity/identity.ts";
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

  const parsed = parseFileSourceIdentity(input.file.path);
  const identity = parsed.source_identity;

  if (!identity || identity.scheme === "daily") {
    return {
      matchedFiles: input.counts.matchedFiles,
      scannedFiles: input.counts.scannedFiles + 1,
    } satisfies LibraryScanCounts;
  }

  const unitNumbers = identity.unit_numbers;
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
