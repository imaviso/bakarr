import { Effect } from "effect";

import { brandMediaId } from "@packages/shared/index.ts";
import type { AsyncOperationAccepted, ImportResult, RenameResult } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import type { InfrastructureError } from "@/features/errors.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { RandomService } from "@/infra/random.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";
import {
  importLibraryFiles,
  type LibraryImportFileInput,
} from "@/features/operations/catalog/catalog-library-write-import-support.ts";
import { renameLibraryFiles } from "@/features/operations/catalog/catalog-library-write-rename-support.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { OperationsTaskWriteService } from "@/features/operations/tasks/operations-task-service.ts";

export interface CatalogLibraryWriteServiceShape {
  readonly importFiles: (
    files: readonly LibraryImportFileInput[],
  ) => Effect.Effect<ImportResult, RuntimeConfigSnapshotError>;
  readonly renameFiles: (
    mediaId: number,
  ) => Effect.Effect<RenameResult, DatabaseError | MediaNotFoundError | RuntimeConfigSnapshotError>;
  readonly startLibraryImport: (
    files: readonly LibraryImportFileInput[],
  ) => Effect.Effect<AsyncOperationAccepted, DatabaseError | InfrastructureError>;
}

export class CatalogLibraryWriteService extends Effect.Service<CatalogLibraryWriteService>()(
  "@bakarr/api/CatalogLibraryWriteService",
  {
    effect: Effect.gen(function* () {
      const eventBus = yield* EventBus;
      const fs = yield* FileSystem;
      const mediaRepository = yield* MediaRepository;
      const mediaUnitRepository = yield* MediaUnitRepository;
      const mediaProbe = yield* MediaProbe;
      const random = yield* RandomService;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
      const taskLauncher = yield* OperationsTaskLauncherService;
      const taskWriteService = yield* OperationsTaskWriteService;

      const importFiles = Effect.fn("CatalogLibraryWrite.importFiles")(function* (
        files: readonly LibraryImportFileInput[],
      ) {
        const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
        return yield* importLibraryFiles({
          eventBus,
          files,
          fs,
          mediaRepository,
          mediaUnitRepository,
          mediaProbe,
          randomUuid: () => random.randomUuid,
          runtimeConfig,
        });
      });

      const renameFiles = Effect.fn("CatalogLibraryWrite.renameFiles")(function* (mediaId: number) {
        const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
        return yield* renameLibraryFiles({
          mediaId,
          eventBus,
          fs,
          mediaRepository,
          mediaUnitRepository,
          runtimeConfig,
        });
      });

      const startLibraryImport = Effect.fn("CatalogLibraryWriteService.startLibraryImport")(
        function* (files: readonly LibraryImportFileInput[]) {
          const mediaId = files[0]?.media_id;

          return yield* taskLauncher.launch({
            ...(mediaId === undefined ? {} : { mediaId }),
            failureMessage: `Library import failed for ${files.length} file(s)`,
            operation: (taskId) =>
              Effect.gen(function* () {
                const importResult = yield* importFiles(files);
                yield* taskWriteService.updateTaskProgress({
                  message: `Imported ${importResult.imported} file(s), ${importResult.failed} failed`,
                  progressCurrent: importResult.imported + importResult.failed,
                  progressTotal: importResult.imported + importResult.failed,
                  taskId,
                });
                return importResult;
              }),
            queuedMessage: `Queued library import for ${files.length} file(s)`,
            runningMessage: `Importing ${files.length} file(s) into library`,
            successMessage: (importResult) =>
              `Library import finished (${importResult.imported} imported, ${importResult.failed} failed)`,
            successProgress: (importResult) => ({
              progressCurrent: importResult.imported + importResult.failed,
              progressTotal: importResult.imported + importResult.failed,
            }),
            successPayload: (importResult) => ({
              ...(mediaId === undefined ? {} : { media_id: brandMediaId(mediaId) }),
              failed: importResult.failed,
              imported: importResult.imported,
              total: importResult.imported + importResult.failed,
            }),
            failurePayload: () => ({
              ...(mediaId === undefined ? {} : { media_id: brandMediaId(mediaId) }),
              failed: files.length,
              total: files.length,
            }),
            taskKey: "library_import",
          });
        },
      );

      return {
        importFiles,
        renameFiles,
        startLibraryImport,
      } satisfies CatalogLibraryWriteServiceShape;
    }),
    // FS + RuntimeConfig provided by ops feature layer.
    dependencies: [
      EventBus.Default,
      MediaRepository.Default,
      MediaUnitRepository.Default,
      OperationsTaskLauncherService.Default,
      OperationsTaskWriteService.Default,
      RandomService.Default,
    ],
  },
) {}

export const CatalogLibraryWriteServiceLive = CatalogLibraryWriteService.Default;
