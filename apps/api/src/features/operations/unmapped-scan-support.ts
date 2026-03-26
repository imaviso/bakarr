import { Effect } from "effect";

import type { ScannerState } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import type { DirEntry, FileSystemShape } from "../../lib/filesystem.ts";
import type { AniListClient } from "../anime/anilist.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "../anime/repository.ts";
import { decodeUnmappedFolderMatchRow, listUnmappedFolderMatchRows } from "../system/repository.ts";
import { OperationsPathError, OperationsStoredDataError } from "./errors.ts";
import {
  buildUnmappedFolderSearchQueries,
  hasUnmappedFolderRetryAttemptsRemaining,
  markUnmappedFolderPending,
  markUnmappedFolderRetryPending,
  mergeUnmappedFolderSuggestions,
} from "./unmapped-folders.ts";
import {
  findBestLocalAnimeMatch,
  scoreAnimeRowMatch,
  toAnimeSearchCandidate,
} from "./library-import.ts";
import { scanVideoFiles } from "./file-scanner.ts";
import { getConfigLibraryPath } from "./repository.ts";
import type { TryDatabasePromise } from "./service-support.ts";

export const findLocalFolderAnimeMatch = Effect.fn("OperationsService.findLocalFolderAnimeMatch")(
  function* (folderName: string, animeRows: ReadonlyArray<typeof anime.$inferSelect>) {
    const queries = buildUnmappedFolderSearchQueries(folderName);

    for (const [index, query] of queries.entries()) {
      const match = findBestLocalAnimeMatch(query, [...animeRows]);

      if (match) {
        return {
          ...(yield* toAnimeSearchCandidate(match)),
          match_confidence: roundConfidence(scoreAnimeRowMatch(query, match)),
          match_reason:
            index === 0
              ? `Matched a library title from the normalized folder name "${folderName}"`
              : `Matched a library title after removing season or release noise from "${folderName}"`,
        };
      }
    }

    return undefined;
  },
);

export const mergeLocalFolderMatch = Effect.fn("OperationsService.mergeLocalFolderMatch")(
  function* (
    folder: ScannerState["folders"][number],
    animeRows: ReadonlyArray<typeof anime.$inferSelect>,
  ) {
    const localMatch = yield* findLocalFolderAnimeMatch(folder.name, animeRows);

    if (!localMatch) {
      return folder;
    }

    return {
      ...folder,
      suggested_matches: [
        localMatch,
        ...folder.suggested_matches.filter((candidate) => candidate.id !== localMatch.id),
      ],
    };
  },
);

function roundConfidence(value: number) {
  return Math.round(value * 100) / 100;
}

export function listUnmappedFolderEntries(
  root: string,
  entries: readonly DirEntry[],
  mappedRoots: ReadonlySet<string>,
) {
  return entries.flatMap((entry) => {
    if (!entry.isDirectory) {
      return [];
    }

    const fullPath = `${root.replace(/\/$/, "")}/${entry.name}`;

    if (mappedRoots.has(fullPath)) {
      return [];
    }

    return [
      {
        match_status: "pending" as const,
        name: entry.name,
        path: fullPath,
        search_queries: buildUnmappedFolderSearchQueries(entry.name),
        size: 0,
        suggested_matches: [],
      },
    ];
  });
}

export function ensureFolderMatchStatus(
  folder: ScannerState["folders"][number],
  cached?: ScannerState["folders"][number],
) {
  if (!cached) {
    return markUnmappedFolderPending(folder);
  }

  return {
    ...folder,
    match_attempts: cached.match_attempts ?? 0,
    last_match_error: cached.last_match_error,
    last_matched_at: cached.last_matched_at,
    match_status: cached.match_status,
    search_queries: folder.search_queries,
    size: cached.size,
    suggested_matches: cached.suggested_matches,
  };
}

export function countCompletedUnmappedMatches(folders: readonly ScannerState["folders"][number][]) {
  return folders.filter(
    (folder) =>
      folder.match_status === "done" ||
      folder.match_status === "paused" ||
      (folder.match_status === "failed" && !hasUnmappedFolderRetryAttemptsRemaining(folder)),
  ).length;
}

export function isUnmappedFolderQueuedForMatch(folder: ScannerState["folders"][number]) {
  return folder.match_status === "pending" || folder.match_status === "matching";
}

export function prepareUnmappedFoldersForScan(
  folders: readonly ScannerState["folders"][number][],
  cachedByPath: ReadonlyMap<string, ScannerState["folders"][number]>,
) {
  return folders.map((folder) => {
    const existing = cachedByPath.get(folder.path);

    if (!existing) {
      return markUnmappedFolderPending(folder);
    }

    const merged = {
      ...folder,
      ...existing,
      match_attempts: existing.match_attempts ?? 0,
      name: folder.name,
      path: folder.path,
    };

    if (existing.match_status === "done") {
      return merged;
    }

    if (existing.match_status === "paused") {
      return merged;
    }

    if (hasUnmappedFolderRetryAttemptsRemaining(existing)) {
      return markUnmappedFolderRetryPending(merged);
    }

    if (existing.match_status === "failed") {
      return merged;
    }

    return markUnmappedFolderPending(merged);
  });
}

export function toUnmappedMatchErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null) {
    if ("cause" in error && error.cause instanceof Error) {
      return error.cause.message;
    }

    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
  }

  return String(error);
}

export const loadUnmappedFolderSnapshot = Effect.fn("OperationsService.loadUnmappedFolderSnapshot")(
  function* (input: {
    db: AppDatabase;
    fs: FileSystemShape;
    nowIso?: () => Effect.Effect<string>;
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
              message: error.message,
            }),
        ),
      ),
    );
    const cachedByPath = new Map(decodedRows.map((decoded) => [decoded.path, decoded] as const));
    const entries = yield* input.fs.readDir(root).pipe(
      Effect.mapError(
        () =>
          new OperationsPathError({
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

export const loadUnmappedFolderVideoSize = Effect.fn(
  "OperationsService.loadUnmappedFolderVideoSize",
)(function* (fs: FileSystemShape, path: string) {
  const files = yield* scanVideoFiles(fs, path).pipe(
    Effect.mapError(
      () =>
        new OperationsPathError({
          message: `Unmapped folder is inaccessible: ${path}`,
        }),
    ),
  );

  return files.reduce((total, file) => total + file.size, 0);
});

export const matchSingleUnmappedFolder = Effect.fn("OperationsService.matchSingleUnmappedFolder")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    animeRows: ReadonlyArray<typeof anime.$inferSelect>;
    db: AppDatabase;
    folder: ScannerState["folders"][number];
    nowIso: () => Effect.Effect<string>;
  }) {
    const queries = buildUnmappedFolderSearchQueries(input.folder.name);
    const suggestions = yield* Effect.forEach(
      queries,
      (query) => input.aniList.searchAnimeMetadata(query),
      { concurrency: 1 },
    ).pipe(Effect.map((resultSets) => resultSets.find((results) => results.length > 0) ?? []));

    const withLocal = yield* mergeLocalFolderMatch(
      {
        ...input.folder,
        suggested_matches: suggestions,
      },
      input.animeRows,
    );

    const annotatedSuggestions = yield* markSearchResultsAlreadyInLibraryEffect(
      input.db,
      withLocal.suggested_matches,
    );

    const now = yield* input.nowIso();

    return mergeUnmappedFolderSuggestions(withLocal, annotatedSuggestions, now);
  },
);
