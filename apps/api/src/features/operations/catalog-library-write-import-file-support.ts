import { Effect, Either } from "effect";
import { brandAnimeId, type ImportResult } from "@packages/shared/index.ts";

import type { AppDatabase } from "@/db/database.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import {
  OperationsInfrastructureError,
  OperationsPathError,
} from "@/features/operations/errors.ts";
import { upsertEpisodeFilesAtomic } from "@/features/operations/download-episode-upsert-support.ts";
import type { LibraryImportPlan } from "@/features/operations/catalog-library-write-import-plan-support.ts";

export interface WriteLibraryImportFileInput {
  readonly db: AppDatabase;
  readonly fs: FileSystemShape;
  readonly plan: LibraryImportPlan;
}

export const writeLibraryImportFile = Effect.fn("Operations.writeLibraryImportFile")((
  input: WriteLibraryImportFileInput,
): Effect.Effect<
  ImportResult["imported_files"][number],
  OperationsPathError | OperationsInfrastructureError
> => {
  const { db, fs, plan } = input;
  return Effect.gen(function* () {
    if (plan.importMode === "move") {
      yield* fs.rename(plan.resolvedSource, plan.destination).pipe(
        Effect.mapError(
          (cause) =>
            new OperationsPathError({
              cause,
              message: `Failed to move file into library: ${plan.sourcePath}`,
            }),
        ),
      );
    } else {
      yield* fs.copyFile(plan.resolvedSource, plan.destination).pipe(
        Effect.mapError(
          (cause) =>
            new OperationsPathError({
              cause,
              message: `Failed to copy file into library: ${plan.sourcePath}`,
            }),
        ),
      );
    }

    const dbResult = yield* upsertEpisodeFilesAtomic(
      db,
      plan.animeRow.id,
      plan.allEpisodeNumbers,
      plan.destination,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new OperationsInfrastructureError({
            cause,
            message: "Failed to import episode files atomically",
          }),
      ),
      Effect.either,
    );

    if (Either.isLeft(dbResult)) {
      const rollbackEffect =
        plan.importMode === "move"
          ? fs.rename(plan.destination, plan.resolvedSource)
          : fs.remove(plan.destination);

      yield* rollbackEffect.pipe(
        Effect.catchTag("FileSystemError", (error) =>
          Effect.logWarning("Failed to rollback filesystem after import error").pipe(
            Effect.annotateLogs({
              destination_path: plan.destination,
              source_path: plan.sourcePath,
              error: String(error),
            }),
          ),
        ),
      );

      return yield* dbResult.left;
    }

    return {
      anime_id: brandAnimeId(plan.animeRow.id),
      destination_path: plan.destination,
      episode_number: plan.episodeNumber,
      episode_numbers: plan.allEpisodeNumbers.length > 1 ? [...plan.allEpisodeNumbers] : undefined,
      naming_fallback_used: plan.namingPlan.fallbackUsed || undefined,
      naming_format_used: plan.namingPlan.formatUsed,
      naming_metadata_snapshot: plan.namingPlan.metadataSnapshot,
      naming_missing_fields:
        plan.namingPlan.missingFields.length > 0 ? [...plan.namingPlan.missingFields] : undefined,
      naming_warnings:
        plan.namingPlan.warnings.length > 0 ? [...plan.namingPlan.warnings] : undefined,
      source_path: plan.sourcePath,
    } satisfies ImportResult["imported_files"][number];
  });
});
