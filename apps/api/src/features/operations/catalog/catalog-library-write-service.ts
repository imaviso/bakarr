import { brandMediaId } from "@packages/shared/index.ts";
import type { AsyncOperationAccepted, ImportResult, RenameResult } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import type { DomainPathError, InfrastructureError } from "@/features/errors.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";
import {
  importLibraryFiles,
  type LibraryImportFileInput,
} from "@/features/operations/catalog/catalog-library-write-import-support.ts";
import { renameLibraryFiles } from "@/features/operations/catalog/catalog-library-write-rename-support.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { LibraryNaming } from "@/features/operations/library/library-naming.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { OperationsTaskWriteService } from "@/features/operations/tasks/operations-task-service.ts";
import { Context, Effect, Layer } from "effect";

export interface CatalogLibraryWriteServiceShape {
  readonly importFiles: (
    files: readonly LibraryImportFileInput[],
  ) => Effect.Effect<ImportResult, RuntimeConfigSnapshotError>;
  readonly renameFiles: (
    mediaId: number,
  ) => Effect.Effect<
    RenameResult,
    DatabaseError | DomainPathError | MediaNotFoundError | RuntimeConfigSnapshotError
  >;
  readonly startLibraryImport: (
    files: readonly LibraryImportFileInput[],
  ) => Effect.Effect<AsyncOperationAccepted, DatabaseError | InfrastructureError>;
}

export class CatalogLibraryWriteService extends Context.Service<
  CatalogLibraryWriteService,
  CatalogLibraryWriteServiceShape
>()("@bakarr/api/CatalogLibraryWriteService") {
  static readonly layer = Layer.effect(
    CatalogLibraryWriteService,
    Effect.gen(function* () {
      const eventBus = yield* EventBus;
      const fs = yield* FileSystem;
      const mediaRepository = yield* MediaRepository;
      const mediaUnitRepository = yield* MediaUnitRepository;
      const naming = yield* LibraryNaming;
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
          naming,
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
          naming,
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
  );
}

export const CatalogLibraryWriteServiceLive = CatalogLibraryWriteService.layer;
