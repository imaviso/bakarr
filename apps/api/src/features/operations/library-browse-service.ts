import { Context, Effect, Layer } from "effect";

import { FileSystem, isWithinPathRoot, type FileSystemShape } from "@/lib/filesystem.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";
import { OperationsInputError, OperationsPathError } from "@/features/operations/errors.ts";

const MAX_BROWSE_LIMIT = 500;
const DEFAULT_BROWSE_LIMIT = 100;

export interface BrowseEntry {
  readonly is_directory: boolean;
  readonly name: string;
  readonly path: string;
  readonly size?: number | undefined;
}

export interface BrowseResult {
  readonly current_path: string;
  readonly entries: readonly BrowseEntry[];
  readonly has_more: boolean;
  readonly limit: number;
  readonly offset: number;
  readonly parent_path?: string | undefined;
  readonly total: number;
}

export type LibraryBrowseError =
  | OperationsInputError
  | OperationsPathError
  | RuntimeConfigSnapshotError;

export interface LibraryBrowseServiceShape {
  readonly browse: (input: {
    readonly path?: string;
    readonly limit?: number;
    readonly offset?: number;
  }) => Effect.Effect<BrowseResult, LibraryBrowseError>;
}

export class LibraryBrowseService extends Context.Tag("@bakarr/api/LibraryBrowseService")<
  LibraryBrowseService,
  LibraryBrowseServiceShape
>() {}

const makeLibraryBrowseService = Effect.gen(function* () {
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
  const fs = yield* FileSystem;

  const browse = Effect.fn("LibraryBrowseService.browse")(function* (input: {
    readonly path?: string;
    readonly limit?: number;
    readonly offset?: number;
  }) {
    const config = yield* runtimeConfigSnapshot.getRuntimeConfig();

    const allowedPrefixes = [
      ...new Set(
        [config.library.library_path, config.library.recycle_path, config.downloads.root_path]
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    ];

    const requestedPath = input.path || ".";

    // Special case: "." means list all allowed root folders as top-level entries.
    if (requestedPath === ".") {
      const entries: BrowseEntry[] = allowedPrefixes.map((path) => ({
        is_directory: true,
        name: path,
        path,
      }));

      const offset = Math.max(0, input.offset ?? 0);
      const total = entries.length;
      const requestedLimit = input.limit ?? DEFAULT_BROWSE_LIMIT;
      const limit = Math.min(
        Math.max(1, requestedLimit),
        MAX_BROWSE_LIMIT,
        Math.max(0, total - offset),
      );

      return {
        current_path: ".",
        entries: entries.slice(offset, offset + limit),
        has_more: offset + limit < total,
        limit,
        offset,
        total,
      } satisfies BrowseResult;
    }

    // Fail closed: if canonicalization fails, reject the request rather than
    // falling back to the un-canonicalized path (fixes P1.7).
    const canonicalPath = yield* fs.realPath(requestedPath).pipe(
      Effect.mapError(
        (cause) =>
          new OperationsPathError({
            cause,
            message: `Path is inaccessible: ${requestedPath}`,
          }),
      ),
    );

    const isAllowed = allowedPrefixes.some((prefix) => isWithinPathRoot(canonicalPath, prefix));

    if (!isAllowed) {
      return yield* new OperationsInputError({
        message: "Path is outside allowed import roots",
      });
    }

    return yield* browseFsPath(fs, canonicalPath, {
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.offset === undefined ? {} : { offset: input.offset }),
    });
  });

  return { browse } satisfies LibraryBrowseServiceShape;
});

export const LibraryBrowseServiceLive = Layer.effect(
  LibraryBrowseService,
  makeLibraryBrowseService,
);

// ---------------------------------------------------------------------------
// Internal filesystem browse helper
// ---------------------------------------------------------------------------

function browseFsPath(
  fs: FileSystemShape,
  path: string,
  options: { readonly limit?: number | undefined; readonly offset?: number | undefined },
): Effect.Effect<BrowseResult, OperationsPathError> {
  return Effect.gen(function* () {
    const offset = Math.max(0, options.offset ?? 0);

    const dirEntries = yield* fs.readDir(path).pipe(
      Effect.mapError(
        (cause) =>
          new OperationsPathError({
            cause,
            message: `Path is inaccessible: ${path}`,
          }),
      ),
    );

    const normalizedBasePath = path.replace(/\/$/, "");
    const allEntries: BrowseEntry[] = dirEntries.map((entry) => ({
      is_directory: entry.isDirectory,
      name: entry.name,
      path: `${normalizedBasePath}/${entry.name}`,
      ...(entry.isFile ? { size: entry.size } : {}),
    }));

    allEntries.sort(
      (left, right) =>
        Number(right.is_directory) - Number(left.is_directory) ||
        left.name.localeCompare(right.name),
    );

    const total = allEntries.length;
    const requestedLimit = options.limit ?? DEFAULT_BROWSE_LIMIT;
    const limit = Math.min(
      Math.max(1, requestedLimit),
      MAX_BROWSE_LIMIT,
      Math.max(0, total - offset),
    );
    const paginatedBase = allEntries.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    const paginatedEntries: BrowseEntry[] = paginatedBase;

    return {
      current_path: path,
      entries: paginatedEntries,
      has_more: hasMore,
      limit,
      offset,
      ...(() => {
        const parentPath = path === "." ? undefined : path.split("/").slice(0, -1).join("/") || "/";
        return parentPath === undefined ? {} : { parent_path: parentPath };
      })(),
      total,
    };
  });
}
