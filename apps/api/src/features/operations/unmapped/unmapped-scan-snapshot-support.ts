import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { isNotFoundError } from "@/infra/filesystem/fs-errors.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { OperationsPathError, OperationsStoredDataError } from "@/features/operations/errors.ts";
import {
  decodeUnmappedFolderMatchRow,
  listUnmappedFolderMatchRows,
} from "@/features/system/repository/unmapped-repository.ts";
import {
  ensureFolderMatchStatus,
  listUnmappedFolderEntries,
} from "@/features/operations/unmapped/unmapped-folder-list-support.ts";
import { getConfigLibraryRoots } from "@/features/operations/repository/config-repository.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";

export const loadUnmappedFolderSnapshot = Effect.fn("OperationsService.loadUnmappedFolderSnapshot")(
  function* (input: {
    db: AppDatabase;
    fs: FileSystemShape;
    nowIso?: () => Effect.Effect<string> | undefined;
    tryDatabasePromise: TryDatabasePromise;
  }) {
    const roots = yield* getConfigLibraryRoots(input.db);
    const animeRows = yield* input.tryDatabasePromise("Failed to scan unmapped folders", () =>
      input.db.select().from(media),
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
    const folders = yield* Effect.flatMap(
      Effect.forEach(roots, ({ mediaKind, path: root }) =>
        input.fs.readDir(root).pipe(
          Effect.catchTag("FileSystemError", (cause) =>
            isNotFoundError(cause)
              ? Effect.succeed([])
              : Effect.fail(
                  new OperationsPathError({
                    cause,
                    message: `Library root is inaccessible: ${root}`,
                  }),
                ),
          ),
          Effect.map((entries) =>
            listUnmappedFolderEntries(root, entries, mappedRoots, mediaKind).map((folder) =>
              ensureFolderMatchStatus(folder, cachedByPath.get(folder.path)),
            ),
          ),
        ),
      ),
      (rootFolders) => Effect.succeed(rootFolders.flat()),
    );

    return {
      animeRows,
      cachedByPath,
      folders,
    };
  },
);
