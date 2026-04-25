import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { OperationsPathError, OperationsStoredDataError } from "@/features/operations/errors.ts";
import {
  decodeUnmappedFolderMatchRow,
  listUnmappedFolderMatchRows,
} from "@/features/system/repository/unmapped-repository.ts";
import {
  ensureFolderMatchStatus,
  listUnmappedFolderEntries,
} from "@/features/operations/unmapped-folder-list-support.ts";
import { getConfigLibraryPath } from "@/features/operations/repository/config-repository.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";

export const loadUnmappedFolderSnapshot = Effect.fn("OperationsService.loadUnmappedFolderSnapshot")(
  function* (input: {
    db: AppDatabase;
    fs: FileSystemShape;
    nowIso?: () => Effect.Effect<string> | undefined;
    tryDatabasePromise: TryDatabasePromise;
  }) {
    const root = yield* getConfigLibraryPath(input.db);
    const animeRows = yield* input.tryDatabasePromise("Failed to scan unmapped folders", () =>
      input.db.select().from(anime),
    );
    const mappedRoots = new Set(animeRows.map((row) => row.rootFolder));
    const cachedRows = yield* listUnmappedFolderMatchRows(input.db);
    const decodedRows = yield* Effect.forEach(cachedRows, (row) =>
      decodeUnmappedFolderMatchRow(row).pipe(
        Effect.mapError(
          (error) =>
            new OperationsStoredDataError({
              cause: error.cause,
              message: error.message,
            }),
        ),
      ),
    );
    const cachedByPath = new Map(decodedRows.map((decoded) => [decoded.path, decoded] as const));
    const entries = yield* input.fs.readDir(root).pipe(
      Effect.mapError(
        (cause) =>
          new OperationsPathError({
            cause,
            message: `Library root is inaccessible: ${root}`,
          }),
      ),
    );
    const folders = listUnmappedFolderEntries(root, entries, mappedRoots).map((folder) =>
      ensureFolderMatchStatus(folder, cachedByPath.get(folder.path)),
    );

    return {
      animeRows,
      cachedByPath,
      folders,
    };
  },
);
