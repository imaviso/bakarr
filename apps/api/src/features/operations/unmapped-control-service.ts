import { Context, Effect, Layer } from "effect";

import { Database, type DatabaseError } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import type {
  OperationsAnimeNotFoundError,
  OperationsPathError,
} from "@/features/operations/errors.ts";
import { UnmappedScanService } from "@/features/operations/unmapped-scan-service.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import {
  decodeUnmappedFolderMatchRow,
  listUnmappedFolderMatchRows,
  loadUnmappedFolderMatchRow,
  upsertUnmappedFolderMatchRows,
} from "@/features/system/repository/unmapped-repository.ts";
import {
  OperationsConflictError,
  OperationsInputError,
  OperationsStoredDataError,
} from "@/features/operations/errors.ts";
import { appendLog } from "@/features/operations/job-support.ts";
import {
  markUnmappedFolderMatching,
  markUnmappedFolderPaused,
  markUnmappedFolderPending,
  resetUnmappedFolderMatch,
} from "@/features/operations/unmapped-folders.ts";
import { loadUnmappedFolderSnapshot } from "@/features/operations/unmapped-scan-snapshot-support.ts";
import type { UnmappedFolder } from "@packages/shared/index.ts";

export type UnmappedControlServiceShape = UnmappedControlWorkflowShape;

export interface UnmappedControlWorkflowShape {
  readonly bulkControlUnmappedFolders: (input: {
    action: "pause_queued" | "resume_paused" | "reset_failed" | "retry_failed";
  }) => Effect.Effect<
    { affectedCount: number },
    DatabaseError | OperationsPathError | OperationsStoredDataError | OperationsAnimeNotFoundError
  >;
  readonly controlUnmappedFolder: (input: {
    action: "pause" | "resume" | "reset" | "refresh";
    path: string;
  }) => Effect.Effect<
    { folderCount: number; folderPath: string },
    | DatabaseError
    | OperationsConflictError
    | OperationsInputError
    | OperationsPathError
    | OperationsStoredDataError
    | OperationsAnimeNotFoundError
  >;
}

export class UnmappedControlService extends Context.Tag("@bakarr/api/UnmappedControlService")<
  UnmappedControlService,
  UnmappedControlServiceShape
>() {}

const makeUnmappedControlService = Effect.gen(function* () {
  const { db } = yield* Database;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;
  const scanService = yield* UnmappedScanService;
  const nowIso = () => nowIsoFromClock(clock);

  const toStoredDataError = (error: { cause?: unknown; message: string }) =>
    new OperationsStoredDataError({
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
    const row = yield* loadUnmappedFolderMatchRow(db, path);

    if (!row) {
      return yield* new OperationsInputError({ message: "Unmapped folder not found" });
    }

    return yield* decodeStoredFolder(row);
  });

  const transitionFolderForAction = (
    folder: UnmappedFolder,
    action: "pause" | "resume" | "reset",
  ) => {
    if (action === "pause") {
      return markUnmappedFolderPaused(folder);
    }

    if (action === "resume") {
      return markUnmappedFolderPending(folder);
    }

    return resetUnmappedFolderMatch(folder);
  };

  const refreshFolderMatch = Effect.fn("OperationsService.refreshFolderMatch")(function* (
    current: UnmappedFolder,
    path: string,
  ) {
    const snapshot = yield* loadUnmappedFolderSnapshot({
      db,
      fs,
      nowIso,
      tryDatabasePromise,
    });
    const target = snapshot.folders.find((folder) => folder.path === path);

    if (!target) {
      return yield* new OperationsInputError({ message: "Unmapped folder not found" });
    }

    const matchingFolder = markUnmappedFolderMatching(target);
    yield* upsertUnmappedFolderMatchRows(db, [matchingFolder], yield* nowIso());

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
    action: "pause" | "resume" | "reset",
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
          : transitionFolderForAction(current, input.action);

      yield* upsertUnmappedFolderMatchRows(db, [nextFolder], yield* nowIso());

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
      const rows = yield* listUnmappedFolderMatchRows(db);
      const folders = yield* Effect.forEach(rows, (row) => decodeStoredFolder(row));

      let nextFolders: UnmappedFolder[];

      if (input.action === "pause_queued") {
        nextFolders = folders
          .filter((folder) => folder.match_status === "pending")
          .map((folder) => markUnmappedFolderPaused(folder));
      } else if (input.action === "resume_paused") {
        nextFolders = folders
          .filter((folder) => folder.match_status === "paused")
          .map((folder) => markUnmappedFolderPending(folder));
      } else {
        nextFolders = folders
          .filter((folder) => folder.match_status === "failed")
          .map((folder) => resetUnmappedFolderMatch(folder));
      }

      if (nextFolders.length === 0) {
        return { affectedCount: 0 };
      }

      yield* upsertUnmappedFolderMatchRows(db, nextFolders, yield* nowIso());

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

  return UnmappedControlService.of({
    bulkControlUnmappedFolders,
    controlUnmappedFolder,
  });
});

export const UnmappedControlServiceLive = Layer.effect(
  UnmappedControlService,
  makeUnmappedControlService,
);
