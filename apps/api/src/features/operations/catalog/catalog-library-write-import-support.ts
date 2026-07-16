import { Effect } from "effect";

import type { Config, ImportResult } from "@packages/shared/index.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { MediaProbeShape } from "@/infra/media/probe.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";
import { buildLibraryImportPlan } from "@/features/operations/catalog/catalog-library-write-import-plan-support.ts";
import { writeLibraryImportFile } from "@/features/operations/catalog/catalog-library-write-import-file-support.ts";

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
  readonly mediaProbe: MediaProbeShape;
  readonly runtimeConfig: Config;
  readonly files: readonly LibraryImportFileInput[];
}

export const importLibraryFiles = Effect.fn("Operations.importLibraryFiles")((
  input: ImportLibraryFilesInput,
): Effect.Effect<ImportResult> => {
  const { eventBus, fs, mediaRepository, mediaUnitRepository, mediaProbe, runtimeConfig, files } =
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
        mediaProbe,
        runtimeConfig,
        file,
      }).pipe(Effect.either);

      if (planned._tag === "Left") {
        failedFiles.push({
          source_path: file.source_path,
          error: planned.left instanceof Error ? planned.left.message : String(planned.left),
        });
        continue;
      }

      const imported = yield* writeLibraryImportFile({
        mediaUnitRepository,
        fs,
        plan: planned.right,
      }).pipe(Effect.either);
      if (imported._tag === "Left") {
        failedFiles.push({
          source_path: file.source_path,
          error: imported.left instanceof Error ? imported.left.message : String(imported.left),
        });
        continue;
      }

      importedFiles.push(imported.right);
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
