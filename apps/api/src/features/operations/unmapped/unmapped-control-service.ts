import { Effect } from "effect";

import { AppDrizzleDatabase, type DatabaseError } from "@/db/database.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import type { DomainPathError } from "@/features/errors.ts";
import { UnmappedScanService } from "@/features/operations/unmapped/unmapped-scan-service.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import {
  decodeUnmappedFolderMatchRow,
  SystemUnmappedRepository,
} from "@/features/system/repository/unmapped-repository.ts";
import { DomainInputError, StoredDataError } from "@/features/errors.ts";
import { OperationsConflictError, OperationsNotFoundError } from "@/features/operations/errors.ts";
import { appendLog } from "@/features/operations/shared/job-support.ts";
import {
  transitionUnmappedFolderForControlAction,
  transitionUnmappedFoldersForBulkControlAction,
  type UnmappedFolderBulkControlAction,
  type UnmappedFolderControlAction,
} from "@/features/operations/unmapped/unmapped-control-policy.ts";
import {
  markUnmappedFolderMatching,
  resetUnmappedFolderMatch,
} from "@/features/operations/unmapped/unmapped-folders.ts";
import { loadUnmappedFolderSnapshot } from "@/features/operations/unmapped/unmapped-scan-snapshot-support.ts";
import type { UnmappedFolder } from "@packages/shared/index.ts";
import { MEDIA_KIND_VALUES } from "@packages/shared/index.ts";
import { getLibraryPathForMediaKind } from "@/features/media/shared/config-support.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";

export type UnmappedControlServiceShape = UnmappedControlWorkflowShape;

export interface UnmappedControlWorkflowShape {
  readonly bulkControlUnmappedFolders: (input: {
    action: "pause_queued" | "resume_paused" | "reset_failed" | "retry_failed";
  }) => Effect.Effect<
    { affectedCount: number },
    DatabaseError | DomainPathError | StoredDataError | OperationsNotFoundError
  >;
  readonly controlUnmappedFolder: (input: {
    action: "pause" | "resume" | "reset" | "refresh";
    path: string;
  }) => Effect.Effect<
    { folderCount: number; folderPath: string },
    | DatabaseError
    | OperationsConflictError
    | DomainInputError
    | DomainPathError
    | StoredDataError
    | OperationsNotFoundError
  >;
}

const makeUnmappedControlService = Effect.fn("UnmappedControlService.make")(function* () {
  const db = yield* AppDrizzleDatabase;
  const fs = yield* FileSystem;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
  const systemUnmappedRepository = yield* SystemUnmappedRepository;
  const scanService = yield* UnmappedScanService;
  const nowIso = currentNowIso;

  const toStoredDataError = (error: { cause?: unknown; message: string }) =>
    new StoredDataError({
      cause: error.cause ?? error,
      message: error.message,
    });

  const decodeStoredFolder = Effect.fn("OperationsService.decodeStoredFolder")(function* (
    row: Parameters<typeof decodeUnmappedFolderMatchRow>[0],
  ) {
    return yield* decodeUnmappedFolderMatchRow(row).pipe(Effect.mapError(toStoredDataError));
  });

  const loadCurrentFolder = Effect.fn("OperationsService.loadCurrentFolder")(function* (
    path: string,
  ) {
    const row = yield* systemUnmappedRepository.loadMatchRow(path);

    if (!row) {
      return yield* new DomainInputError({ message: "Unmapped folder not found" });
    }

    return yield* decodeStoredFolder(row);
  });

  const refreshFolderMatch = Effect.fn("OperationsService.refreshFolderMatch")(function* (
    current: UnmappedFolder,
    path: string,
  ) {
    const snapshot = yield* loadUnmappedFolderSnapshot({
      db,
      fs,
      nowIso,
      roots: Effect.fn("UnmappedControlService.getConfiguredRoots")(function* () {
        const config = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
          Effect.mapError((error) =>
            error._tag === "DatabaseError"
              ? error
              : new StoredDataError({
                  cause: error,
                  message: "Stored runtime config is unavailable for unmapped control",
                }),
          ),
        );
        return MEDIA_KIND_VALUES.map((mediaKind) => ({
          mediaKind,
          path: getLibraryPathForMediaKind(config.library, mediaKind),
        }));
      }),
      systemUnmappedRepository,
      tryDatabasePromise,
    });
    const target = snapshot.folders.find((folder) => folder.path === path);

    if (!target) {
      return yield* new DomainInputError({ message: "Unmapped folder not found" });
    }

    const matchingFolder = markUnmappedFolderMatching(target);
    yield* systemUnmappedRepository.upsertMatchRows([matchingFolder], yield* nowIso());

    const matchResult = yield* scanService.matchAndPersistUnmappedFolder(
      matchingFolder,
      snapshot.animeRows,
    );

    if (matchResult._tag === "Failed") {
      return yield* new OperationsConflictError({
        message: matchResult.folder.last_match_error ?? "Failed to refresh folder match",
      });
    }

    yield* appendLog(
      db,
      "library.unmapped.control",
      "info",
      `refreshed unmapped folder ${current.name}`,
      nowIso,
    );

    return { folderCount: 1, folderPath: path };
  });

  const appendControlActionLog = Effect.fn("OperationsService.appendControlActionLog")(function* (
    action: UnmappedFolderControlAction,
    folderName: string,
  ) {
    yield* appendLog(
      db,
      "library.unmapped.control",
      "info",
      `${action} unmapped folder ${folderName}`,
      nowIso,
    );
  });

  const controlUnmappedFolder = Effect.fn("OperationsService.controlUnmappedFolder")(
    function* (input: { action: "pause" | "resume" | "reset" | "refresh"; path: string }) {
      const current = yield* loadCurrentFolder(input.path);

      if (current.match_status === "matching") {
        return yield* new OperationsConflictError({
          message: "Folder is currently matching in the background",
        });
      }

      const nextFolder =
        input.action === "refresh"
          ? resetUnmappedFolderMatch(current)
          : transitionUnmappedFolderForControlAction(current, input.action);

      yield* systemUnmappedRepository.upsertMatchRows([nextFolder], yield* nowIso());

      if (input.action === "refresh") {
        return yield* refreshFolderMatch(current, input.path);
      }

      yield* appendControlActionLog(input.action, current.name);

      return { folderCount: 0, folderPath: input.path };
    },
  );

  const bulkControlUnmappedFolders = Effect.fn("OperationsService.bulkControlUnmappedFolders")(
    function* (input: {
      action: "pause_queued" | "resume_paused" | "reset_failed" | "retry_failed";
    }) {
      const rows = yield* systemUnmappedRepository.listMatchRows();
      const folders = yield* Effect.forEach(rows, (row) => decodeStoredFolder(row));

      const nextFolders = transitionUnmappedFoldersForBulkControlAction(
        folders,
        input.action satisfies UnmappedFolderBulkControlAction,
      );

      if (nextFolders.length === 0) {
        return { affectedCount: 0 };
      }

      yield* systemUnmappedRepository.upsertMatchRows(nextFolders, yield* nowIso());

      let logMessage = `Queued ${nextFolders.length} failed unmapped folder(s) for retry`;

      if (input.action === "pause_queued") {
        logMessage = `Paused ${nextFolders.length} queued unmapped folder(s)`;
      } else if (input.action === "resume_paused") {
        logMessage = `Queued ${nextFolders.length} paused unmapped folder(s)`;
      } else if (input.action === "reset_failed") {
        logMessage = `Reset ${nextFolders.length} failed unmapped folder(s)`;
      }

      yield* appendLog(db, "library.unmapped.control.bulk", "info", logMessage, nowIso);

      return { affectedCount: nextFolders.length };
    },
  );

  return {
    bulkControlUnmappedFolders,
    controlUnmappedFolder,
  } satisfies UnmappedControlServiceShape;
});

export class UnmappedControlService extends Effect.Service<UnmappedControlService>()(
  "@bakarr/api/UnmappedControlService",
  { effect: makeUnmappedControlService() },
) {}

export const UnmappedControlServiceLive = UnmappedControlService.Default;
