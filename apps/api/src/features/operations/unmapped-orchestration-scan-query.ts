import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { anime, backgroundJobs } from "../../db/schema.ts";
import { type FileSystemShape } from "../../lib/filesystem.ts";
import type { AniListClient } from "../anime/anilist.ts";
import {
  deleteUnmappedFolderMatchRowsNotInPaths,
  upsertUnmappedFolderMatchRows,
} from "../system/repository/unmapped-repository.ts";
import {
  prepareUnmappedFoldersForScan,
  toUnmappedMatchErrorMessage,
} from "./unmapped-folder-list-support.ts";
import { loadUnmappedFolderSnapshot } from "./unmapped-scan-snapshot-support.ts";
import { mergeLocalFolderMatch } from "./unmapped-folder-match-support.ts";
import { matchSingleUnmappedFolder } from "./unmapped-scan-match-support.ts";
import { isUnmappedFolderOutstanding, markUnmappedFolderFailed } from "./unmapped-folders.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";

export type UnmappedScanQueryShape = ReturnType<typeof makeUnmappedScanQuerySupport>;

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

      return { folders, queuedFolders, snapshot };
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
    const now = yield* nowIso();

    return {
      has_outstanding_matches: hasOutstandingMatches,
      folders,
      is_scanning: Boolean(job?.isRunning),
      last_updated: job?.lastRunAt ?? now,
    };
  });

  const matchAndPersistUnmappedFolder = Effect.fn(
    "OperationsService.matchAndPersistUnmappedFolder",
  )(function* (
    matchingFolder: ReturnType<typeof prepareUnmappedFoldersForScan>[number],
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
      };
    }

    yield* upsertUnmappedFolderMatchRows(db, [matchResult.right], yield* nowIso());

    return {
      _tag: "Matched" as const,
      folder: matchResult.right,
    };
  });

  return {
    getUnmappedFolders,
    loadQueuedUnmappedFolders,
    matchAndPersistUnmappedFolder,
  };
}
