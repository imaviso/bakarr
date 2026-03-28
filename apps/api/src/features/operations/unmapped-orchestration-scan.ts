import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { type FileSystemShape } from "../../lib/filesystem.ts";
import type { AniListClient } from "../anime/anilist.ts";
import {
  deleteUnmappedFolderMatchRowsNotInPaths,
  upsertUnmappedFolderMatchRows,
} from "../system/repository/unmapped-repository.ts";
import { OperationsPathError } from "./errors.ts";
import {
  appendLog,
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
  updateJobProgress,
} from "./job-support.ts";
import {
  countCompletedUnmappedMatches,
  isUnmappedFolderQueuedForMatch,
} from "./unmapped-folder-list-support.ts";
import { markUnmappedFolderMatching } from "./unmapped-folders.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";
import type { OperationsCoordinationShape } from "./runtime-support.ts";
import type { UnmappedScanQueryShape } from "./unmapped-orchestration-scan-query.ts";
import { makeUnmappedScanQuerySupport } from "./unmapped-orchestration-scan-query.ts";

export interface UnmappedScanWorkflowShape {
  readonly getUnmappedFolders: UnmappedScanQueryShape["getUnmappedFolders"];
  readonly matchAndPersistUnmappedFolder: UnmappedScanQueryShape["matchAndPersistUnmappedFolder"];
  readonly runUnmappedScan: () => Effect.Effect<
    { folderCount: number },
    DatabaseError | OperationsPathError | import("./errors.ts").OperationsStoredDataError
  >;
}

export function makeUnmappedScanWorkflow(input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  coordination: OperationsCoordinationShape;
  fs: FileSystemShape;
  nowIso: () => Effect.Effect<string>;
  tryDatabasePromise: TryDatabasePromise;
}) {
  const { aniList, db, dbError, coordination, fs, tryDatabasePromise } = input;
  const { nowIso } = input;
  const { getUnmappedFolders, loadQueuedUnmappedFolders, matchAndPersistUnmappedFolder } =
    makeUnmappedScanQuerySupport({
      aniList,
      db,
      fs,
      nowIso,
      tryDatabasePromise,
    });

  const runUnmappedScanPass = Effect.fn("OperationsService.runUnmappedScanPass")(
    function* () {
      yield* markJobStarted(db, "unmapped_scan", nowIso);

      const { folders, queuedFolders, snapshot } = yield* loadQueuedUnmappedFolders();

      yield* upsertUnmappedFolderMatchRows(db, queuedFolders, yield* nowIso());
      yield* deleteUnmappedFolderMatchRowsNotInPaths(
        db,
        folders.map((folder) => folder.path),
      );

      const nextTarget = queuedFolders.find(isUnmappedFolderQueuedForMatch);

      if (!nextTarget) {
        yield* markJobSucceeded(
          db,
          "unmapped_scan",
          `Processed ${queuedFolders.length} unmapped folder(s)`,
          nowIso,
        );
        return { folderCount: queuedFolders.length };
      }

      yield* updateJobProgress(
        db,
        "unmapped_scan",
        countCompletedUnmappedMatches(queuedFolders) + 1,
        queuedFolders.length,
        nowIso,
        `Matching ${nextTarget.name}`,
      );

      const matchingFolder = markUnmappedFolderMatching(nextTarget);
      yield* upsertUnmappedFolderMatchRows(db, [matchingFolder], yield* nowIso());

      const matchResult = yield* matchAndPersistUnmappedFolder(matchingFolder, snapshot.animeRows);

      if (matchResult._tag === "Failed") {
        const failedFolder = matchResult.folder;
        yield* markJobFailed(
          db,
          "unmapped_scan",
          failedFolder.last_match_error ?? `Failed to match ${nextTarget.name}`,
          nowIso,
        );

        yield* appendLog(
          db,
          "library.unmapped.scan",
          "warn",
          `Failed to match unmapped folder ${nextTarget.name}: ${
            failedFolder.last_match_error ?? "Unknown error"
          }`,
          nowIso,
        );

        return { folderCount: queuedFolders.length };
      }

      yield* markJobSucceeded(
        db,
        "unmapped_scan",
        `Processed ${nextTarget.name} (${queuedFolders.length} unmapped folder(s) total)`,
        nowIso,
      );
      yield* appendLog(
        db,
        "library.unmapped.scan",
        "info",
        `Matched unmapped folder ${nextTarget.name}`,
        nowIso,
      );

      return { folderCount: queuedFolders.length };
    },
    Effect.catchAll((cause) =>
      markJobFailed(db, "unmapped_scan", cause, nowIso).pipe(
        Effect.zipRight(
          cause instanceof DatabaseError || cause instanceof OperationsPathError
            ? Effect.fail(cause)
            : Effect.fail(dbError("Failed to scan unmapped folders")(cause)),
        ),
      ),
    ),
  );

  const unmappedScanLoop = Effect.fn("OperationsService.unmappedScanLoop")(function* () {
    while (true) {
      yield* runUnmappedScanPass();

      const { queuedFolders: remainingQueuedFolders } = yield* loadQueuedUnmappedFolders();

      if (!remainingQueuedFolders.some(isUnmappedFolderQueuedForMatch)) {
        return;
      }

      yield* Effect.sleep("3 seconds");
    }
  });

  const startUnmappedScanLoop = Effect.fn("OperationsService.startUnmappedScanLoop")(function* () {
    const alreadyRunning = yield* coordination.tryBeginUnmappedScan();

    if (alreadyRunning) {
      return { folderCount: 0 };
    }

    let forked = false;

    try {
      const { queuedFolders } = yield* loadQueuedUnmappedFolders();
      const folderCount = queuedFolders.length;

      if (!queuedFolders.some(isUnmappedFolderQueuedForMatch)) {
        return { folderCount: 0 };
      }

      const loop = unmappedScanLoop().pipe(
        Effect.catchAllCause((cause) =>
          Effect.logError("Unmapped scan loop failed").pipe(
            Effect.annotateLogs({ error: cause.toString() }),
          ),
        ),
        Effect.ensuring(coordination.completeUnmappedScan()),
      );

      yield* coordination.forkUnmappedScanLoop(loop);
      forked = true;

      return { folderCount };
    } finally {
      if (!forked) {
        yield* coordination.completeUnmappedScan();
      }
    }
  });

  const runUnmappedScan = Effect.fn("OperationsService.runUnmappedScan")(function* () {
    return yield* startUnmappedScanLoop();
  });

  return {
    getUnmappedFolders,
    matchAndPersistUnmappedFolder,
    runUnmappedScan,
  } satisfies UnmappedScanWorkflowShape;
}
