import { brandMediaId, type Config, type ImportResult } from "@packages/shared/index.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";
import { InfrastructureError } from "@/features/errors.ts";
import {
  buildLibraryImportPlan,
  type LibraryImportPlan,
} from "@/features/operations/catalog/catalog-library-write-import-plan-support.ts";
import {
  toLibraryNamingMedia,
  type LibraryNamingShape,
} from "@/features/operations/library/library-naming.ts";
import { Effect, Result } from "effect";

export interface LibraryImportFileInput {
  readonly source_path: string;
  readonly media_id: number;
  readonly unit_number: number;
  readonly unit_numbers?: readonly number[];
  readonly season?: number;
}

export interface ImportLibraryFilesInput {
  readonly eventBus: typeof EventBus.Service;
  readonly fs: FileSystemShape;
  readonly mediaRepository: typeof MediaRepository.Service;
  readonly mediaUnitRepository: MediaUnitRepositoryShape;
  readonly naming: LibraryNamingShape;
  readonly runtimeConfig: Config;
  readonly files: readonly LibraryImportFileInput[];
}

export const importLibraryFiles = Effect.fn("Operations.importLibraryFiles")((
  input: ImportLibraryFilesInput,
): Effect.Effect<ImportResult> => {
  const { eventBus, fs, mediaRepository, mediaUnitRepository, naming, runtimeConfig, files } =
    input;
  return Effect.gen(function* () {
    yield* eventBus.publish({
      type: "ImportStarted",
      payload: {
        count: files.length,
      },
    });

    const importedFiles: ImportResult["imported_files"] = [];
    const failedFiles: ImportResult["failed_files"] = [];

    for (const file of files) {
      const planned = yield* buildLibraryImportPlan({
        fs,
        mediaRepository,
        naming,
        runtimeConfig,
        file,
      }).pipe(Effect.result);

      if (planned._tag === "Failure") {
        failedFiles.push({
          source_path: file.source_path,
          error:
            planned.failure instanceof Error
              ? planned.failure.message
              : globalThis.String(planned.failure),
        });
        continue;
      }

      const imported = yield* writePlannedImportFile({
        fs,
        mediaUnitRepository,
        naming,
        plan: planned.success,
      }).pipe(Effect.result);
      if (imported._tag === "Failure") {
        failedFiles.push({
          source_path: file.source_path,
          error:
            imported.failure instanceof Error
              ? imported.failure.message
              : globalThis.String(imported.failure),
        });
        continue;
      }

      importedFiles.push(imported.success);
    }

    yield* eventBus.publish({
      type: "ImportFinished",
      payload: {
        count: files.length,
        imported: importedFiles.length,
        failed: failedFiles.length,
      },
    });

    return {
      imported: importedFiles.length,
      failed: failedFiles.length,
      imported_files: importedFiles,
      failed_files: failedFiles,
    } satisfies ImportResult;
  });
});

const writePlannedImportFile = Effect.fn("Operations.writePlannedImportFile")(function* (input: {
  readonly fs: FileSystemShape;
  readonly mediaUnitRepository: MediaUnitRepositoryShape;
  readonly naming: LibraryNamingShape;
  readonly plan: LibraryImportPlan;
}) {
  const { mediaUnitRepository, naming, plan } = input;
  const placed = yield* naming.placeFile(
    {
      episodeRows: plan.episodeRows,
      media: toLibraryNamingMedia(plan.animeRow),
      namingFormat: plan.namingFormat,
      preferredTitle: plan.preferredTitle,
      ...(plan.season === undefined ? {} : { season: plan.season }),
      ...(plan.sourceMetadata === undefined ? {} : { downloadSourceMetadata: plan.sourceMetadata }),
      sourcePath: plan.resolvedSource,
      unitNumbers: plan.allEpisodeNumbers,
    },
    { importMode: plan.importMode },
  );

  const dbResult = yield* mediaUnitRepository
    .upsertUnitFiles(plan.animeRow.id, plan.allEpisodeNumbers, placed.destination)
    .pipe(
      Effect.mapError(
        (cause) =>
          new InfrastructureError({
            cause,
            message: "Failed to import episode files atomically",
          }),
      ),
      Effect.result,
    );

  if (Result.isFailure(dbResult)) {
    const rollbackEffect =
      plan.importMode === "move"
        ? input.fs.rename(placed.destination, plan.resolvedSource)
        : input.fs.remove(placed.destination);

    yield* rollbackEffect.pipe(
      Effect.catchTag("FileSystemError", (error) =>
        Effect.logWarning("Failed to rollback filesystem after import error").pipe(
          Effect.annotateLogs({
            destination_path: placed.destination,
            source_path: plan.sourcePath,
            error: globalThis.String(error),
          }),
        ),
      ),
    );

    return yield* dbResult.failure;
  }

  return {
    media_id: brandMediaId(plan.animeRow.id),
    destination_path: placed.destination,
    unit_number: plan.unitNumber,
    unit_numbers: plan.allEpisodeNumbers.length > 1 ? [...plan.allEpisodeNumbers] : undefined,
    naming_fallback_used: placed.plan.fallbackUsed || undefined,
    naming_format_used: placed.plan.formatUsed,
    naming_metadata_snapshot: placed.plan.metadataSnapshot,
    naming_missing_fields:
      placed.plan.missingFields.length > 0 ? [...placed.plan.missingFields] : undefined,
    naming_warnings: placed.plan.warnings.length > 0 ? [...placed.plan.warnings] : undefined,
    source_path: plan.sourcePath,
  } satisfies ImportResult["imported_files"][number];
});
