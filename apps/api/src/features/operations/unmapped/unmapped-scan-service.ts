// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Cause, Effect } from "effect";

import {
  MEDIA_KIND_VALUES,
  type AsyncOperationAccepted,
  type ScannerState,
} from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import { DomainPathError, InfrastructureError, StoredDataError } from "@/features/errors.ts";
import { getLibraryPathForMediaKind } from "@/features/media/shared/config-support.ts";
import { mergeLocalFolderMatch } from "@/features/operations/unmapped/unmapped-folder-match-support.ts";
import {
  countCompletedUnmappedMatches,
  isUnmappedFolderQueuedForMatch,
  prepareUnmappedFoldersForScan,
  toUnmappedMatchErrorMessage,
} from "@/features/operations/unmapped/unmapped-folder-list-support.ts";
import {
  isUnmappedFolderOutstanding,
  markUnmappedFolderFailed,
  markUnmappedFolderMatching,
} from "@/features/operations/unmapped/unmapped-folders.ts";
import { loadUnmappedFolderSnapshot } from "@/features/operations/unmapped/unmapped-scan-snapshot-support.ts";
import { matchSingleUnmappedFolder } from "@/features/operations/unmapped/unmapped-scan-match-support.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { BackgroundJobRunner } from "@/background/background-job-runner.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { SystemUnmappedRepository } from "@/features/system/repository/unmapped-repository.ts";
import { UnmappedScanCoordinator } from "@/features/operations/tasks/task-coordinators.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";

export interface UnmappedScanServiceShape {
  readonly getUnmappedFolders: () => Effect.Effect<
    ScannerState,
    DatabaseError | DomainPathError | StoredDataError
  >;
  readonly matchAndPersistUnmappedFolder: (
    matchingFolder: ScannerState["folders"][number],
    animeRows: ReadonlyArray<typeof media.$inferSelect>,
  ) => Effect.Effect<UnmappedMatchResult, DatabaseError | StoredDataError>;
  readonly runUnmappedScan: () => Effect.Effect<
    { folderCount: number },
    DatabaseError | DomainPathError | InfrastructureError | StoredDataError
  >;
  readonly startUnmappedScan: () => Effect.Effect<
    AsyncOperationAccepted,
    DatabaseError | InfrastructureError
  >;
}

interface UnmappedScanSnapshot {
  readonly animeRows: ReadonlyArray<typeof media.$inferSelect>;
  readonly cachedByPath: ReadonlyMap<string, ScannerState["folders"][number]>;
  readonly folders: ScannerState["folders"];
}

interface UnmappedScanQueryResult {
  readonly folders: ScannerState["folders"];
  readonly queuedFolders: ScannerState["folders"];
  readonly snapshot: UnmappedScanSnapshot;
}

interface UnmappedMatchResultFailed {
  readonly _tag: "Failed";
  readonly folder: ScannerState["folders"][number];
}

interface UnmappedMatchResultMatched {
  readonly _tag: "Matched";
  readonly folder: ScannerState["folders"][number];
}

type UnmappedMatchResult = UnmappedMatchResultFailed | UnmappedMatchResultMatched;

const makeUnmappedScanService = Effect.fn("UnmappedScanService.make")(function* () {
  const aniList = yield* AniListClient;
  const backgroundJobRunner = yield* BackgroundJobRunner;
  const eventBus = yield* EventBus;
  const fs = yield* FileSystem;
  const mediaRepository = yield* MediaRepository;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
  const systemLogRepository = yield* SystemLogRepository;
  const systemUnmappedRepository = yield* SystemUnmappedRepository;
  const taskLauncher = yield* OperationsTaskLauncherService;
  const unmappedScanCoordinator = yield* UnmappedScanCoordinator;
  const nowIso = currentNowIso;

  const loadConfiguredRoots = Effect.fn("UnmappedScanService.loadConfiguredRoots")(function* () {
    const config = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
      Effect.mapError((error) =>
        error._tag === "DatabaseError"
          ? error
          : new StoredDataError({
              cause: error,
              message: "Stored runtime config is unavailable for unmapped scan",
            }),
      ),
    );

    return MEDIA_KIND_VALUES.map((mediaKind) => ({
      mediaKind,
      path: getLibraryPathForMediaKind(config.library, mediaKind),
    }));
  });

  const loadMergedUnmappedFolders = Effect.fn("UnmappedScanService.loadMergedUnmappedFolders")(
    function* () {
      const snapshot = yield* loadUnmappedFolderSnapshot({
        fs,
        roots: loadConfiguredRoots,
        systemUnmappedRepository,
        mediaRepository,
      });

      const folders = yield* Effect.forEach(snapshot.folders, (folder) =>
        mergeLocalFolderMatch(folder, snapshot.animeRows),
      );

      return {
        folders,
        snapshot,
      } satisfies Pick<UnmappedScanQueryResult, "folders" | "snapshot">;
    },
  );

  const loadQueuedUnmappedFolders = Effect.fn("UnmappedScanService.loadQueuedUnmappedFolders")(
    function* () {
      const { folders, snapshot } = yield* loadMergedUnmappedFolders();
      const queuedFolders = prepareUnmappedFoldersForScan(folders, snapshot.cachedByPath);

      return { folders, queuedFolders, snapshot } satisfies UnmappedScanQueryResult;
    },
  );

  const getUnmappedFolders = Effect.fn("UnmappedScanService.getUnmappedFolders")(function* () {
    const { folders, snapshot } = yield* loadMergedUnmappedFolders();
    const job = yield* backgroundJobRunner.loadByName("unmapped_scan");

    const newFolders = folders.filter((folder) => !snapshot.cachedByPath.has(folder.path));
    const now = yield* nowIso();

    yield* systemUnmappedRepository.upsertMatchRows(newFolders, now);
    yield* systemUnmappedRepository.deleteMatchRowsNotInPaths(folders.map((folder) => folder.path));

    const hasOutstandingMatches = folders.some(isUnmappedFolderOutstanding);
    const matchCounts = countScannerMatches(folders);

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
    "UnmappedScanService.matchAndPersistUnmappedFolder",
  )(function* (
    matchingFolder: ScannerState["folders"][number],
    animeRows: ReadonlyArray<typeof media.$inferSelect>,
  ) {
    const matchResult = yield* Effect.either(
      matchSingleUnmappedFolder({
        aniList,
        animeRows,
        folder: matchingFolder,
        mediaRepository,
        nowIso,
      }),
    );

    if (matchResult._tag === "Left") {
      const errorMessage = toUnmappedMatchErrorMessage(matchResult.left);
      const now = yield* nowIso();
      const failedFolder = markUnmappedFolderFailed(matchingFolder, errorMessage, now);

      yield* systemUnmappedRepository.upsertMatchRows([failedFolder], now);

      return {
        _tag: "Failed",
        folder: failedFolder,
      } satisfies UnmappedMatchResult;
    }

    const now = yield* nowIso();
    yield* systemUnmappedRepository.upsertMatchRows([matchResult.right], now);

    return {
      _tag: "Matched",
      folder: matchResult.right,
    } satisfies UnmappedMatchResult;
  });

  const failAfterMarkingJobFailure = (error: DatabaseError | DomainPathError | StoredDataError) =>
    backgroundJobRunner
      .markFailed("unmapped_scan", error)
      .pipe(Effect.zipRight(Effect.fail(error)));

  const failInfrastructureAfterMarkingJobFailure = (cause: Cause.Cause<unknown>) => {
    const infrastructureError = new InfrastructureError({
      message: "Failed to scan unmapped folders",
      cause,
    });

    return backgroundJobRunner
      .markFailed("unmapped_scan", cause)
      .pipe(Effect.zipRight(Effect.fail(infrastructureError)));
  };

  const runUnmappedScanPass = Effect.fn("UnmappedScanService.runUnmappedScanPass")(
    function* () {
      yield* backgroundJobRunner.markStarted("unmapped_scan");

      const { folders, queuedFolders, snapshot } = yield* loadQueuedUnmappedFolders();

      yield* systemUnmappedRepository.upsertMatchRows(queuedFolders, yield* nowIso());
      yield* systemUnmappedRepository.deleteMatchRowsNotInPaths(
        folders.map((folder) => folder.path),
      );

      const targets = queuedFolders.filter(isUnmappedFolderQueuedForMatch);

      if (targets.length === 0) {
        yield* backgroundJobRunner.markSucceeded(
          "unmapped_scan",
          `Processed ${queuedFolders.length} unmapped folder(s)`,
        );

        return { folderCount: queuedFolders.length, hasQueuedTargets: false };
      }

      let completedCount = countCompletedUnmappedMatches(queuedFolders);

      for (const target of targets) {
        completedCount += 1;
        yield* backgroundJobRunner.updateProgress(
          "unmapped_scan",
          completedCount,
          queuedFolders.length,
          `Matching ${target.name}`,
        );

        const matchingFolder = markUnmappedFolderMatching(target);
        yield* systemUnmappedRepository.upsertMatchRows([matchingFolder], yield* nowIso());

        const matchResult = yield* matchAndPersistUnmappedFolder(
          matchingFolder,
          snapshot.animeRows,
        );

        if (matchResult._tag === "Failed") {
          const failedFolder = matchResult.folder;
          yield* backgroundJobRunner.markFailed(
            "unmapped_scan",
            failedFolder.last_match_error ?? `Failed to match ${target.name}`,
          );

          yield* systemLogRepository.appendLog(
            "library.unmapped.scan",
            "warn",
            `Failed to match unmapped folder ${target.name}: ${
              failedFolder.last_match_error ?? "Unknown error"
            }`,
            nowIso,
          );

          return { folderCount: queuedFolders.length, hasQueuedTargets: true };
        }

        yield* backgroundJobRunner.markSucceeded(
          "unmapped_scan",
          `Processed ${target.name} (${queuedFolders.length} unmapped folder(s) total)`,
        );
        yield* systemLogRepository.appendLog(
          "library.unmapped.scan",
          "info",
          `Matched unmapped folder ${target.name}`,
          nowIso,
        );
      }

      return { folderCount: queuedFolders.length, hasQueuedTargets: true };
    },
    Effect.catchTag("DatabaseError", failAfterMarkingJobFailure),
    Effect.catchTag("DomainPathError", failAfterMarkingJobFailure),
    Effect.catchTag("StoredDataError", failAfterMarkingJobFailure),
    Effect.catchAllCause(failInfrastructureAfterMarkingJobFailure),
  );

  const unmappedScanLoop = Effect.fn("UnmappedScanService.unmappedScanLoop")(function* () {
    // Iterate while queued targets remain, pausing 3s between passes.
    yield* Effect.iterate(
      { folderCount: 0, hasQueuedTargets: true },
      {
        while: (state) => state.hasQueuedTargets,
        body: () =>
          Effect.gen(function* () {
            const next = yield* runUnmappedScanPass();

            if (next.hasQueuedTargets) {
              yield* Effect.sleep("3 seconds");
            }

            return next;
          }),
      },
    );
  });

  const startUnmappedScanLoop = Effect.fn("UnmappedScanService.startUnmappedScanLoop")(
    function* () {
      return yield* unmappedScanCoordinator.withUnmappedScanLease({
        whenAcquired: Effect.gen(function* () {
          const { queuedFolders } = yield* loadQueuedUnmappedFolders();
          const folderCount = queuedFolders.length;

          if (!queuedFolders.some(isUnmappedFolderQueuedForMatch)) {
            return {
              keepLease: false,
              value: { folderCount: 0 },
            };
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
          };
        }),
        whenBusy: Effect.succeed({ folderCount: 0 }),
      });
    },
  );

  const runUnmappedScan = Effect.fn("UnmappedScanService.runUnmappedScan")(function* () {
    return yield* startUnmappedScanLoop();
  });

  const startUnmappedScan = Effect.fn("UnmappedScanService.startUnmappedScan")(function* () {
    return yield* taskLauncher.launch({
      failureMessage: "Manual unmapped-folder scan failed",
      operation: () => runUnmappedScan(),
      queuedMessage: "Queued manual unmapped-folder scan",
      runningMessage: "Running manual unmapped-folder scan",
      successMessage: (result) =>
        `Manual unmapped-folder scan finished (${result.folderCount} folder(s))`,
      successProgress: (result) => ({
        progressCurrent: result.folderCount,
        progressTotal: result.folderCount,
      }),
      taskKey: "unmapped_scan_manual",
    });
  });

  return {
    getUnmappedFolders,
    matchAndPersistUnmappedFolder,
    runUnmappedScan,
    startUnmappedScan,
  } satisfies UnmappedScanServiceShape;
});

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
  readonly hasOutstandingMatches: boolean;
  readonly isRunning: boolean;
  readonly lastStatus: string | null | undefined;
  readonly matchCounts: ScannerState["match_counts"];
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

export class UnmappedScanService extends Effect.Service<UnmappedScanService>()(
  "@bakarr/api/UnmappedScanService",
  {
    // AniListClient + RuntimeConfigSnapshotService come from the lifecycle layer.
    dependencies: [
      BackgroundJobRunner.Default,
      MediaRepository.Default,
      OperationsTaskLauncherService.Default,
      SystemLogRepository.Default,
      SystemUnmappedRepository.Default,
      UnmappedScanCoordinator.Default,
    ],
    effect: makeUnmappedScanService(),
  },
) {}

export const UnmappedScanServiceLive = UnmappedScanService.Default;
