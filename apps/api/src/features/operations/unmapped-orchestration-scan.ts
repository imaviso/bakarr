import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { type FileSystemShape } from "@/lib/filesystem.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import {
  deleteUnmappedFolderMatchRowsNotInPaths,
  upsertUnmappedFolderMatchRows,
} from "@/features/system/repository/unmapped-repository.ts";
import {
  OperationsPathError,
  OperationsInfrastructureError,
} from "@/features/operations/errors.ts";
import {
  appendLog,
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
  updateJobProgress,
} from "@/features/operations/job-support.ts";
import {
  countCompletedUnmappedMatches,
  isUnmappedFolderQueuedForMatch,
} from "@/features/operations/unmapped-folder-list-support.ts";
import { markUnmappedFolderMatching } from "@/features/operations/unmapped-folders.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";
import type { UnmappedScanCoordinatorShape } from "@/features/operations/runtime-support.ts";
import type { UnmappedScanQueryShape } from "@/features/operations/unmapped-orchestration-scan-query.ts";
import { makeUnmappedScanQuerySupport } from "@/features/operations/unmapped-orchestration-scan-query.ts";

export interface UnmappedScanWorkflowShape {
  readonly getUnmappedFolders: UnmappedScanQueryShape["getUnmappedFolders"];
  readonly matchAndPersistUnmappedFolder: UnmappedScanQueryShape["matchAndPersistUnmappedFolder"];
  readonly runUnmappedScan: () => Effect.Effect<
    { folderCount: number },
    | DatabaseError
    | OperationsPathError
    | OperationsInfrastructureError
    | import("./errors.ts").OperationsStoredDataError
  >;
}

export function makeUnmappedScanWorkflow(input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  unmappedScanCoordinator: UnmappedScanCoordinatorShape;
  fs: FileSystemShape;
  nowIso: () => Effect.Effect<string>;
  tryDatabasePromise: TryDatabasePromise;
}) {
  const { aniList, db, fs, tryDatabasePromise, unmappedScanCoordinator } = input;
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
          Effect.fail(
            cause instanceof DatabaseError || cause instanceof OperationsPathError
              ? cause
              : new OperationsInfrastructureError({
                  message: "Failed to scan unmapped folders",
                  cause,
                }),
          ),
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
    const alreadyRunning = yield* unmappedScanCoordinator.tryBeginUnmappedScan();

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
            Effect.asVoid,
          ),
        ),
        Effect.ensuring(unmappedScanCoordinator.completeUnmappedScan()),
      );

      yield* unmappedScanCoordinator.forkUnmappedScanLoop(loop);
      forked = true;

      return { folderCount };
    } finally {
      if (!forked) {
        yield* unmappedScanCoordinator.completeUnmappedScan();
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
