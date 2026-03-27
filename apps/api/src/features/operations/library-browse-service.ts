import { Context, Effect, Layer } from "effect";

import { DatabaseError } from "../../db/database.ts";
import { FileSystem, isWithinPathRoot, type FileSystemShape } from "../../lib/filesystem.ts";
import { LibraryRootsService } from "../library-roots/service.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "../system/errors.ts";
import { SystemConfigService } from "../system/system-config-service.ts";
import { OperationsInputError, OperationsPathError } from "./errors.ts";

const MAX_BROWSE_LIMIT = 500;

export interface BrowseEntry {
  readonly is_directory: boolean;
  readonly name: string;
  readonly path: string;
  readonly size?: number;
}

export interface BrowseResult {
  readonly current_path: string;
  readonly entries: readonly BrowseEntry[];
  readonly has_more: boolean;
  readonly limit: number;
  readonly offset: number;
  readonly parent_path?: string;
  readonly total: number;
}

export type LibraryBrowseError =
  | DatabaseError
  | OperationsInputError
  | OperationsPathError
  | StoredConfigCorruptError
  | StoredConfigMissingError;

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
  const systemService = yield* SystemConfigService;
  const libraryRootsService = yield* LibraryRootsService;
  const fs = yield* FileSystem;

  const browse = Effect.fn("LibraryBrowseService.browse")(function* (input: {
    readonly path?: string;
    readonly limit?: number;
    readonly offset?: number;
  }) {
    const config = yield* systemService.getConfig();
    const roots = yield* libraryRootsService.listRoots();

    const allowedPrefixes = [
      ...roots.map((r) => r.path),
      config.downloads.root_path,
      config.library.library_path,
    ].filter(Boolean) as string[];

    const requestedPath = input.path || ".";

    // Special case: "." means list all allowed root folders as top-level entries.
    if (requestedPath === ".") {
      const entries: BrowseEntry[] = allowedPrefixes.map((path) => ({
        is_directory: true,
        name: path,
        path,
      }));

      const requestedLimit = input.limit ?? 100;
      const limit = Math.min(Math.max(1, requestedLimit), MAX_BROWSE_LIMIT);
      const offset = Math.max(0, input.offset ?? 0);
      const total = entries.length;

      return {
        current_path: ".",
        entries: entries.slice(offset, offset + limit),
        has_more: offset + limit < total,
        limit,
        offset,
        parent_path: undefined,
        total,
      } satisfies BrowseResult;
    }

    // Fail closed: if canonicalization fails, reject the request rather than
    // falling back to the un-canonicalized path (fixes P1.7).
    const canonicalPath = yield* fs.realPath(requestedPath).pipe(
      Effect.mapError(
        () =>
          new OperationsPathError({
            message: `Path is inaccessible: ${requestedPath}`,
          }),
      ),
    );

    const isAllowed = allowedPrefixes.some((prefix) => isWithinPathRoot(canonicalPath, prefix));

    if (!isAllowed) {
      return yield* new OperationsInputError({
        message: "Path is outside allowed library roots",
      });
    }

    return yield* browseFsPath(fs, canonicalPath, {
      limit: input.limit,
      offset: input.offset,
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
  options: { readonly limit?: number; readonly offset?: number },
): Effect.Effect<BrowseResult, OperationsPathError> {
  return Effect.gen(function* () {
    const requestedLimit = options.limit;
    const limit =
      requestedLimit === undefined
        ? undefined
        : Math.min(Math.max(1, requestedLimit), MAX_BROWSE_LIMIT);
    const offset = Math.max(0, options.offset ?? 0);

    const dirEntries = yield* fs.readDir(path).pipe(
      Effect.mapError(
        () =>
          new OperationsPathError({
            message: `Path is inaccessible: ${path}`,
          }),
      ),
    );

    const normalizedBasePath = path.replace(/\/$/, "");
    const allEntries: BrowseEntry[] = dirEntries.map((entry) => ({
      is_directory: entry.isDirectory,
      name: entry.name,
      path: `${normalizedBasePath}/${entry.name}`,
    }));

    allEntries.sort(
      (left, right) =>
        Number(right.is_directory) - Number(left.is_directory) ||
        left.name.localeCompare(right.name),
    );

    const total = allEntries.length;
    const paginatedBase =
      limit === undefined ? allEntries.slice(offset) : allEntries.slice(offset, offset + limit);
    const hasMore = limit === undefined ? false : offset + limit < total;
    const responseLimit = limit ?? paginatedBase.length;

    const paginatedEntries = yield* Effect.forEach(
      paginatedBase,
      (entry) =>
        entry.is_directory
          ? Effect.succeed(entry)
          : fs.stat(entry.path).pipe(
              Effect.map((stats) => ({
                ...entry,
                size: stats.isFile ? stats.size : undefined,
              })),
              Effect.mapError(
                () =>
                  new OperationsPathError({
                    message: `Path is inaccessible: ${entry.path}`,
                  }),
              ),
            ),
      { concurrency: "unbounded" },
    );

    return {
      current_path: path,
      entries: paginatedEntries,
      has_more: hasMore,
      limit: responseLimit,
      offset,
      parent_path: path === "." ? undefined : path.split("/").slice(0, -1).join("/") || "/",
      total,
    };
  });
}
