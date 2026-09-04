import type { Config, ImportResult } from "@packages/shared/index.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { MediaProbeShape } from "@/infra/media/probe.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";
import { buildLibraryImportPlan } from "@/features/operations/catalog/catalog-library-write-import-plan-support.ts";
import { writeLibraryImportFile } from "@/features/operations/download/library-file-write-support.ts";
import { Effect } from "effect";

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
  readonly randomUuid: () => Effect.Effect<string>;
  readonly runtimeConfig: Config;
  readonly files: readonly LibraryImportFileInput[];
}

export const importLibraryFiles = Effect.fn("Operations.importLibraryFiles")((
  input: ImportLibraryFilesInput,
): Effect.Effect<ImportResult> => {
  const {
    eventBus,
    fs,
    mediaRepository,
    mediaUnitRepository,
    mediaProbe,
    randomUuid,
    runtimeConfig,
    files,
  } = input;
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

      const imported = yield* writeLibraryImportFile({
        mediaUnitRepository,
        fs,
        randomUuid,
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
