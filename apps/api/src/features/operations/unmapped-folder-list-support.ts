import type { ScannerState } from "@packages/shared/index.ts";
import type { DirEntry } from "@/lib/filesystem.ts";
import {
  buildUnmappedFolderSearchQueries,
  hasUnmappedFolderRetryAttemptsRemaining,
  markUnmappedFolderPending,
  markUnmappedFolderRetryPending,
} from "@/features/operations/unmapped-folders.ts";

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
