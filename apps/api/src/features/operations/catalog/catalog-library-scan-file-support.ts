import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { classifyMediaArtifact, parseFileSourceIdentity } from "@/infra/media/identity/identity.ts";
import { upsertEpisodeFilesAtomic } from "@/features/operations/download/download-episode-upsert-support.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";

export interface LibraryScanCounts {
  readonly matchedFiles: number;
  readonly scannedFiles: number;
}

export const countLibraryScanFile = Effect.fn("OperationsService.countLibraryScanFile")(function* (
  db: AppDatabase,
  input: {
    animeId: number;
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

  const episodeNumbers = identity.episode_numbers;
  if (episodeNumbers.length === 0) {
    return {
      matchedFiles: input.counts.matchedFiles,
      scannedFiles: input.counts.scannedFiles + 1,
    } satisfies LibraryScanCounts;
  }

  yield* upsertEpisodeFilesAtomic(db, input.animeId, episodeNumbers, input.file.path).pipe(
    Effect.mapError(
      (cause) =>
        new OperationsInfrastructureError({
          message: "Failed to run library scan",
          cause,
        }),
    ),
  );

  return {
    matchedFiles: input.counts.matchedFiles + episodeNumbers.length,
    scannedFiles: input.counts.scannedFiles + 1,
  } satisfies LibraryScanCounts;
});
