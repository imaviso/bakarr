import { Effect } from "effect";

import type { ImportResult, RenameResult } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";
import {
  importLibraryFiles,
  type LibraryImportFileInput,
} from "@/features/operations/catalog/catalog-library-write-import-support.ts";
import { renameLibraryFiles } from "@/features/operations/catalog/catalog-library-write-rename-support.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";

export interface CatalogLibraryWriteServiceShape {
  readonly importFiles: (
    files: readonly LibraryImportFileInput[],
  ) => Effect.Effect<ImportResult, RuntimeConfigSnapshotError>;
  readonly renameFiles: (
    mediaId: number,
  ) => Effect.Effect<RenameResult, DatabaseError | MediaNotFoundError | RuntimeConfigSnapshotError>;
}

export class CatalogLibraryWriteService extends Effect.Service<CatalogLibraryWriteService>()(
  "@bakarr/api/CatalogLibraryWriteService",
  {
    effect: Effect.gen(function* () {
      const eventBus = yield* EventBus;
      const fs = yield* FileSystem;
      const mediaReadRepository = yield* MediaReadRepository;
      const mediaUnitRepository = yield* MediaUnitRepository;
      const mediaProbe = yield* MediaProbe;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

      const importFiles = Effect.fn("OperationsService.importFiles")(function* (
        files: readonly LibraryImportFileInput[],
      ) {
        const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
        return yield* importLibraryFiles({
          eventBus,
          files,
          fs,
          mediaReadRepository,
          mediaUnitRepository,
          mediaProbe,
          runtimeConfig,
        });
      });

      const renameFiles = Effect.fn("OperationsService.renameFiles")(function* (mediaId: number) {
        const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
        return yield* renameLibraryFiles({
          mediaId,
          eventBus,
          fs,
          mediaReadRepository,
          mediaUnitRepository,
          runtimeConfig,
        });
      });

      return {
        importFiles,
        renameFiles,
      } satisfies CatalogLibraryWriteServiceShape;
    }),
    dependencies: [MediaReadRepository.Default, MediaUnitRepository.Default],
  },
) {}

export const CatalogLibraryWriteServiceLive = CatalogLibraryWriteService.Default;
