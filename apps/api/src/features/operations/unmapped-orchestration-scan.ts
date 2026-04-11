import { Cause, Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import type { EventBusShape } from "@/features/events/event-bus.ts";
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
import { markJobFailureOrFailWithError } from "@/lib/job-failure-support.ts";

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
  eventBus: EventBusShape;
  unmappedScanCoordinator: UnmappedScanCoordinatorShape;
  fs: FileSystemShape;
  nowIso: () => Effect.Effect<string>;
  tryDatabasePromise: TryDatabasePromise;
}) {
  const { aniList, db, eventBus, fs, tryDatabasePromise, unmappedScanCoordinator } = input;
  const { nowIso } = input;
  const { getUnmappedFolders, loadQueuedUnmappedFolders, matchAndPersistUnmappedFolder } =
    makeUnmappedScanQuerySupport({
      aniList,
      db,
      fs,
      nowIso,
      tryDatabasePromise,
    });

  const failAfterMarkingJobFailure = (
    error: DatabaseError | OperationsPathError | import("./errors.ts").OperationsStoredDataError,
  ) =>
    markJobFailureOrFailWithError({
      error,
      job: "unmapped_scan",
      logAnnotations: { run_failure: error.message },
      logMessage: "Failed to record unmapped scan job failure",
      markFailed: markJobFailed(db, "unmapped_scan", error, nowIso),
    }).pipe(
      Effect.catchTag("JobFailurePersistenceError", () => Effect.void),
      Effect.zipRight(Effect.fail(error)),
    );

  const failInfrastructureAfterMarkingJobFailure = (cause: Cause.Cause<unknown>) => {
    const infrastructureError = new OperationsInfrastructureError({
      message: "Failed to scan unmapped folders",
      cause,
    });

    return markJobFailureOrFailWithError({
      error: infrastructureError,
      job: "unmapped_scan",
      logAnnotations: { run_failure_cause: Cause.pretty(cause) },
      logMessage: "Failed to record unmapped scan infrastructure failure",
      markFailed: markJobFailed(db, "unmapped_scan", cause, nowIso),
    }).pipe(
      Effect.catchTag("JobFailurePersistenceError", () => Effect.void),
      Effect.zipRight(Effect.fail(infrastructureError)),
    );
  };

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
    Effect.catchTag("DatabaseError", failAfterMarkingJobFailure),
    Effect.catchTag("OperationsPathError", failAfterMarkingJobFailure),
    Effect.catchTag("OperationsStoredDataError", failAfterMarkingJobFailure),
    Effect.catchAllCause(failInfrastructureAfterMarkingJobFailure),
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
    return yield* unmappedScanCoordinator.withUnmappedScanLease({
      whenAcquired: Effect.gen(function* () {
        const { queuedFolders } = yield* loadQueuedUnmappedFolders();
        const folderCount = queuedFolders.length;

        if (!queuedFolders.some(isUnmappedFolderQueuedForMatch)) {
          return {
            keepLease: false,
            value: { folderCount: 0 },
          } as const;
        }

        yield* eventBus.publish({ type: "ScanStarted" });

        const loop = unmappedScanLoop().pipe(
          Effect.catchAllCause((cause) =>
            Effect.logError("Unmapped scan loop failed").pipe(
              Effect.annotateLogs({ error: Cause.pretty(cause) }),
              Effect.zipRight(Effect.failCause(cause)),
            ),
          ),
          Effect.ensuring(eventBus.publish({ type: "ScanFinished" })),
          Effect.ensuring(unmappedScanCoordinator.completeUnmappedScan()),
        );

        yield* unmappedScanCoordinator.forkUnmappedScanLoop(loop);

        return {
          keepLease: true,
          value: { folderCount },
        } as const;
      }),
      whenBusy: Effect.succeed({ folderCount: 0 }),
    });
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
