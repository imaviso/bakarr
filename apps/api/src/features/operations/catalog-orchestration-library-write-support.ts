import type { Effect } from "effect";
import type { AppDatabase } from "@/db/database.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import type { MediaProbeShape } from "@/lib/media-probe.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";
import {
  importLibraryFiles,
  type LibraryImportFileInput,
} from "@/features/operations/catalog-library-write-import-support.ts";
import { renameLibraryFiles } from "@/features/operations/catalog-library-write-rename-support.ts";
import type { DatabaseError } from "@/db/database.ts";
import type {
  OperationsAnimeNotFoundError,
  OperationsInfrastructureError,
  OperationsPathError,
} from "@/features/operations/errors.ts";
import type { ImportResult, RenameResult } from "@packages/shared/index.ts";

export interface CatalogLibraryWriteSupportShape {
  readonly importFiles: (
    files: readonly LibraryImportFileInput[],
  ) => Effect.Effect<
    ImportResult,
    | DatabaseError
    | OperationsPathError
    | OperationsInfrastructureError
    | OperationsAnimeNotFoundError
  >;
  readonly renameFiles: (
    animeId: number,
  ) => Effect.Effect<
    RenameResult,
    DatabaseError | OperationsPathError | OperationsAnimeNotFoundError
  >;
}

export function makeCatalogLibraryWriteSupport(input: {
  db: AppDatabase;
  eventBus: typeof EventBus.Service;
  fs: FileSystemShape;
  mediaProbe: MediaProbeShape;
  tryDatabasePromise: TryDatabasePromise;
}) {
  const { db, eventBus, fs, mediaProbe, tryDatabasePromise } = input;

  return {
    importFiles: (files) =>
      importLibraryFiles({ db, eventBus, fs, mediaProbe, tryDatabasePromise, files }),
    renameFiles: (animeId) => renameLibraryFiles({ db, eventBus, fs, tryDatabasePromise, animeId }),
  } satisfies CatalogLibraryWriteSupportShape;
}
