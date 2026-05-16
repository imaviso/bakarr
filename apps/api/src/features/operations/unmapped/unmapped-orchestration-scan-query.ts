import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { ScannerState } from "@packages/shared/index.ts";
import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { anime, backgroundJobs } from "@/db/schema.ts";
import { type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { AniListClient } from "@/features/anime/metadata/anilist.ts";
import { OperationsPathError, OperationsStoredDataError } from "@/features/operations/errors.ts";
import {
  deleteUnmappedFolderMatchRowsNotInPaths,
  upsertUnmappedFolderMatchRows,
} from "@/features/system/repository/unmapped-repository.ts";
import {
  prepareUnmappedFoldersForScan,
  toUnmappedMatchErrorMessage,
} from "@/features/operations/unmapped/unmapped-folder-list-support.ts";
import { loadUnmappedFolderSnapshot } from "@/features/operations/unmapped/unmapped-scan-snapshot-support.ts";
import { mergeLocalFolderMatch } from "@/features/operations/unmapped/unmapped-folder-match-support.ts";
import { matchSingleUnmappedFolder } from "@/features/operations/unmapped/unmapped-scan-match-support.ts";
import {
  isUnmappedFolderOutstanding,
  markUnmappedFolderFailed,
} from "@/features/operations/unmapped/unmapped-folders.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";

export interface UnmappedScanSnapshot {
  readonly animeRows: ReadonlyArray<typeof anime.$inferSelect>;
  readonly cachedByPath: ReadonlyMap<string, ScannerState["folders"][number]>;
  readonly folders: ScannerState["folders"];
}

export interface UnmappedScanQueryResult {
  readonly folders: ScannerState["folders"];
  readonly queuedFolders: ScannerState["folders"];
  readonly snapshot: UnmappedScanSnapshot;
}

export interface UnmappedMatchResultFailed {
  readonly _tag: "Failed";
  readonly folder: ScannerState["folders"][number];
}

export interface UnmappedMatchResultMatched {
  readonly _tag: "Matched";
  readonly folder: ScannerState["folders"][number];
}

export type UnmappedMatchResult = UnmappedMatchResultFailed | UnmappedMatchResultMatched;

export interface UnmappedScanQueryShape {
  readonly getUnmappedFolders: () => Effect.Effect<
    ScannerState,
    DatabaseError | OperationsPathError | OperationsStoredDataError
  >;
  readonly loadQueuedUnmappedFolders: () => Effect.Effect<
    UnmappedScanQueryResult,
    DatabaseError | OperationsPathError | OperationsStoredDataError
  >;
  readonly matchAndPersistUnmappedFolder: (
    matchingFolder: ScannerState["folders"][number],
    animeRows: ReadonlyArray<typeof anime.$inferSelect>,
  ) => Effect.Effect<UnmappedMatchResult, DatabaseError | OperationsStoredDataError>;
}

export function makeUnmappedScanQuerySupport(input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  fs: FileSystemShape;
  nowIso: () => Effect.Effect<string>;
  tryDatabasePromise: TryDatabasePromise;
}) {
  const { aniList, db, fs, nowIso, tryDatabasePromise } = input;

  const loadQueuedUnmappedFolders = Effect.fn("OperationsService.loadQueuedUnmappedFolders")(
    function* () {
      const snapshot = yield* loadUnmappedFolderSnapshot({
        db,
        fs,
        nowIso,
        tryDatabasePromise,
      });
      const folders = yield* Effect.forEach(snapshot.folders, (folder) =>
        mergeLocalFolderMatch(folder, snapshot.animeRows),
      );
      const queuedFolders = prepareUnmappedFoldersForScan(folders, snapshot.cachedByPath);

      return { folders, queuedFolders, snapshot } satisfies UnmappedScanQueryResult;
    },
  );

  const getUnmappedFolders = Effect.fn("OperationsService.getUnmappedFolders")(function* () {
    const snapshot = yield* loadUnmappedFolderSnapshot({
      db,
      fs,
      nowIso,
      tryDatabasePromise,
    });
    const [job] = yield* tryDatabasePromise("Failed to scan unmapped folders", () =>
      db.select().from(backgroundJobs).where(eq(backgroundJobs.name, "unmapped_scan")).limit(1),
    );

    const folders = yield* Effect.forEach(snapshot.folders, (folder) =>
      mergeLocalFolderMatch(folder, snapshot.animeRows),
    );

    const newFolders = folders.filter((folder) => !snapshot.cachedByPath.has(folder.path));

    yield* upsertUnmappedFolderMatchRows(db, newFolders, yield* nowIso());
    yield* deleteUnmappedFolderMatchRowsNotInPaths(
      db,
      folders.map((folder) => folder.path),
    );

    const hasOutstandingMatches = folders.some(isUnmappedFolderOutstanding);
    const matchCounts = countScannerMatches(folders);
    const now = yield* nowIso();

    return {
      has_outstanding_matches: hasOutstandingMatches,
      folders,
      is_scanning: Boolean(job?.isRunning),
      last_updated: job?.lastRunAt ?? now,
      match_counts: matchCounts,
      match_status: resolveScannerMatchStatus({
        hasOutstandingMatches,
        isRunning: Boolean(job?.isRunning),
        lastStatus: job?.lastStatus,
        matchCounts,
      }),
    } satisfies ScannerState;
  });

  const matchAndPersistUnmappedFolder = Effect.fn(
    "OperationsService.matchAndPersistUnmappedFolder",
  )(function* (
    matchingFolder: ScannerState["folders"][number],
    animeRows: ReadonlyArray<typeof anime.$inferSelect>,
  ) {
    const matchResult = yield* Effect.either(
      matchSingleUnmappedFolder({
        aniList,
        animeRows,
        db,
        folder: matchingFolder,
        nowIso,
      }),
    );

    if (matchResult._tag === "Left") {
      const errorMessage = toUnmappedMatchErrorMessage(matchResult.left);
      const now = yield* nowIso();
      const failedFolder = markUnmappedFolderFailed(matchingFolder, errorMessage, now);
      yield* upsertUnmappedFolderMatchRows(db, [failedFolder], yield* nowIso());

      return {
        _tag: "Failed" as const,
        folder: failedFolder,
      } satisfies UnmappedMatchResult;
    }

    yield* upsertUnmappedFolderMatchRows(db, [matchResult.right], yield* nowIso());

    return {
      _tag: "Matched" as const,
      folder: matchResult.right,
    } satisfies UnmappedMatchResult;
  });

  return {
    getUnmappedFolders,
    loadQueuedUnmappedFolders,
    matchAndPersistUnmappedFolder,
  } satisfies UnmappedScanQueryShape;
}

function countScannerMatches(folders: ScannerState["folders"]) {
  let exact = 0;
  let queued = 0;
  let matching = 0;
  let matched = 0;
  let failed = 0;
  let paused = 0;

  for (const folder of folders) {
    if (folder.suggested_matches[0]?.already_in_library) {
      exact += 1;
    }

    switch (folder.match_status) {
      case "pending":
        queued += 1;
        break;
      case "matching":
        matching += 1;
        break;
      case "done":
        matched += 1;
        break;
      case "failed":
        failed += 1;
        break;
      case "paused":
        paused += 1;
        break;
    }
  }

  return {
    exact,
    failed,
    matched,
    matching,
    paused,
    queued,
  } satisfies ScannerState["match_counts"];
}

function resolveScannerMatchStatus(input: {
  hasOutstandingMatches: boolean;
  isRunning: boolean;
  lastStatus: string | null | undefined;
  matchCounts: ScannerState["match_counts"];
}): ScannerState["match_status"] {
  if (input.matchCounts.matching > 0 || (input.isRunning && input.hasOutstandingMatches)) {
    return "running";
  }

  if (input.matchCounts.failed > 0 && input.hasOutstandingMatches) {
    return "retrying";
  }

  if (input.hasOutstandingMatches) {
    return "queued";
  }

  if (input.matchCounts.paused > 0) {
    return "paused";
  }

  if (input.lastStatus === "failed") {
    return "failed";
  }

  return "idle";
}
