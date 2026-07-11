import { Effect } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { isNotFoundError } from "@/infra/filesystem/fs-errors.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { DomainPathError, StoredDataError } from "@/features/errors.ts";
import {
  decodeUnmappedFolderMatchRow,
  type SystemUnmappedRepositoryShape,
} from "@/features/system/repository/unmapped-repository.ts";
import {
  ensureFolderMatchStatus,
  listUnmappedFolderEntries,
} from "@/features/operations/unmapped/unmapped-folder-list-support.ts";
import type { MediaKind } from "@packages/shared/index.ts";
import type { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";

export interface ConfigLibraryRoot {
  readonly mediaKind: MediaKind;
  readonly path: string;
}

export const loadUnmappedFolderSnapshot = Effect.fn(
  "UnmappedFolderSnapshot.loadUnmappedFolderSnapshot",
)(function* (input: {
  fs: FileSystemShape;
  nowIso?: () => Effect.Effect<string> | undefined;
  roots: () => Effect.Effect<readonly ConfigLibraryRoot[], DatabaseError | StoredDataError>;
  systemUnmappedRepository: SystemUnmappedRepositoryShape;
  mediaReadRepository: typeof MediaReadRepository.Service;
}) {
  const animeRows = yield* input.mediaReadRepository.listAllMediaRows();
  const mappedRoots = new Set(animeRows.map((row) => row.rootFolder));
  const cachedRows = yield* input.systemUnmappedRepository.listMatchRows();
  const roots = yield* input.roots();
  const decodedRows = yield* Effect.forEach(cachedRows, (row) =>
    decodeUnmappedFolderMatchRow(row).pipe(
      Effect.mapError(
        (error) =>
          new StoredDataError({
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
                new DomainPathError({
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
});
