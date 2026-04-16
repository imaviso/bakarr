import { Context, Effect, Layer } from "effect";

import type { ImportResult, RenameResult } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import type {
  OperationsAnimeNotFoundError,
} from "@/features/operations/errors.ts";
import {
  importLibraryFiles,
  type LibraryImportFileInput,
} from "@/features/operations/catalog-library-write-import-support.ts";
import { renameLibraryFiles } from "@/features/operations/catalog-library-write-rename-support.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export interface CatalogLibraryWriteServiceShape {
  readonly importFiles: (
    files: readonly LibraryImportFileInput[],
  ) => Effect.Effect<ImportResult, RuntimeConfigSnapshotError>;
  readonly renameFiles: (
    animeId: number,
  ) => Effect.Effect<
    RenameResult,
    DatabaseError | OperationsAnimeNotFoundError | RuntimeConfigSnapshotError
  >;
}

export class CatalogLibraryWriteService extends Context.Tag(
  "@bakarr/api/CatalogLibraryWriteService",
)<CatalogLibraryWriteService, CatalogLibraryWriteServiceShape>() {}

export const CatalogLibraryWriteServiceLive = Layer.effect(
  CatalogLibraryWriteService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const fs = yield* FileSystem;
    const mediaProbe = yield* MediaProbe;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

    const importFiles = Effect.fn("OperationsService.importFiles")(function* (
      files: readonly LibraryImportFileInput[],
    ) {
      const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
      return yield* importLibraryFiles({
        db,
        eventBus,
        files,
        fs,
        mediaProbe,
        runtimeConfig,
        tryDatabasePromise,
      });
    });

    const renameFiles = Effect.fn("OperationsService.renameFiles")(function* (animeId: number) {
      const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
      return yield* renameLibraryFiles({
        animeId,
        db,
        eventBus,
        fs,
        runtimeConfig,
        tryDatabasePromise,
      });
    });

    return CatalogLibraryWriteService.of({
      importFiles,
      renameFiles,
    });
  }),
);
