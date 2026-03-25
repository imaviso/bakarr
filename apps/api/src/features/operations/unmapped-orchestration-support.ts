import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { anime, backgroundJobs } from "../../db/schema.ts";
import {
  type DirEntry,
  type FileSystemShape,
  isWithinPathRoot,
  sanitizePathSegment,
} from "../../lib/filesystem.ts";
import { classifyMediaArtifact, parseFileSourceIdentity } from "../../lib/media-identity.ts";
import {
  inferAiredAt,
  resolveAnimeRootFolderEffect,
  upsertEpisodeEffect,
} from "../anime/repository.ts";
import type { AniListClient } from "../anime/anilist.ts";
import {
  decodeUnmappedFolderMatchRow,
  deleteUnmappedFolderMatchRowsNotInPaths,
  listUnmappedFolderMatchRows,
  loadUnmappedFolderMatchRow,
  upsertUnmappedFolderMatchRows,
} from "../system/repository.ts";
import { OperationsConflictError, OperationsInputError, OperationsPathError } from "./errors.ts";
import { scanVideoFiles } from "./file-scanner.ts";
import {
  appendLog,
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
  nowIso,
  updateJobProgress,
} from "./job-support.ts";
import { getConfigLibraryPath, requireAnime } from "./repository.ts";
import type { TryDatabasePromise } from "./service-support.ts";
import {
  isUnmappedFolderOutstanding,
  markUnmappedFolderFailed,
  markUnmappedFolderMatching,
  markUnmappedFolderPaused,
  markUnmappedFolderPending,
  resetUnmappedFolderMatch,
} from "./unmapped-folders.ts";
import {
  countCompletedUnmappedMatches,
  isUnmappedFolderQueuedForMatch,
  loadUnmappedFolderSnapshot,
  matchSingleUnmappedFolder,
  mergeLocalFolderMatch,
  prepareUnmappedFoldersForScan,
  toUnmappedMatchErrorMessage,
} from "./unmapped-scan-support.ts";
import type { OperationsCoordinationShape } from "./runtime-support.ts";

export function makeUnmappedOrchestrationSupport(input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  coordination: OperationsCoordinationShape;
  fs: FileSystemShape;
  tryDatabasePromise: TryDatabasePromise;
}) {
  const { aniList, db, dbError, coordination, fs, tryDatabasePromise } = input;

  const loadQueuedUnmappedFolders = Effect.fn("OperationsService.loadQueuedUnmappedFolders")(
    function* () {
      const snapshot = yield* loadUnmappedFolderSnapshot({
        db,
        fs,
        tryDatabasePromise,
      });
      const folders = snapshot.folders.map((folder) =>
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
      tryDatabasePromise,
    });
    const [job] = yield* tryDatabasePromise("Failed to scan unmapped folders", () =>
      db.select().from(backgroundJobs).where(eq(backgroundJobs.name, "unmapped_scan")).limit(1),
    );

    const folders = snapshot.folders.map((folder) =>
      mergeLocalFolderMatch(folder, snapshot.animeRows),
    );

    const newFolders = folders.filter((folder) => !snapshot.cachedByPath.has(folder.path));

    yield* upsertUnmappedFolderMatchRows(db, newFolders);
    yield* deleteUnmappedFolderMatchRowsNotInPaths(
      db,
      folders.map((folder) => folder.path),
    );

    const hasOutstandingMatches = folders.some(isUnmappedFolderOutstanding);
    const now = yield* nowIso;

    return {
      has_outstanding_matches: hasOutstandingMatches,
      folders,
      is_scanning: Boolean(job?.isRunning),
      last_updated: job?.lastRunAt ?? now,
    };
  });

  const runUnmappedScanPass = Effect.fn("OperationsService.runUnmappedScanPass")(function* () {
    yield* markJobStarted(db, "unmapped_scan");

    return yield* Effect.gen(function* () {
      const { folders, queuedFolders, snapshot } = yield* loadQueuedUnmappedFolders();

      yield* upsertUnmappedFolderMatchRows(db, queuedFolders);
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
        );
        return { folderCount: queuedFolders.length };
      }

      yield* updateJobProgress(
        db,
        "unmapped_scan",
        countCompletedUnmappedMatches(queuedFolders) + 1,
        queuedFolders.length,
        `Matching ${nextTarget.name}`,
      );

      const matchingFolder = markUnmappedFolderMatching(nextTarget);
      yield* upsertUnmappedFolderMatchRows(db, [matchingFolder]);

      const matchResult = yield* Effect.either(
        matchSingleUnmappedFolder({
          aniList,
          animeRows: snapshot.animeRows,
          db,
          folder: matchingFolder,
        }),
      );

      if (matchResult._tag === "Left") {
        const errorMessage = toUnmappedMatchErrorMessage(matchResult.left);
        const now = yield* nowIso;
        const failedFolder = markUnmappedFolderFailed(matchingFolder, errorMessage, now);
        yield* upsertUnmappedFolderMatchRows(db, [failedFolder]);
        yield* markJobFailed(
          db,
          "unmapped_scan",
          failedFolder.last_match_error ?? `Failed to match ${nextTarget.name}`,
        );

        yield* appendLog(
          db,
          "library.unmapped.scan",
          "warn",
          `Failed to match unmapped folder ${nextTarget.name}: ${
            failedFolder.last_match_error ?? "Unknown error"
          }`,
        );

        return { folderCount: queuedFolders.length };
      }

      const matchedFolder = matchResult.right;

      yield* upsertUnmappedFolderMatchRows(db, [matchedFolder]);

      yield* markJobSucceeded(
        db,
        "unmapped_scan",
        `Processed ${nextTarget.name} (${queuedFolders.length} unmapped folder(s) total)`,
      );
      yield* appendLog(
        db,
        "library.unmapped.scan",
        "info",
        `Matched unmapped folder ${nextTarget.name}`,
      );

      return { folderCount: queuedFolders.length };
    }).pipe(
      Effect.catchAll((cause) =>
        markJobFailed(db, "unmapped_scan", cause).pipe(
          Effect.zipRight(
            cause instanceof DatabaseError || cause instanceof OperationsPathError
              ? Effect.fail(cause)
              : Effect.fail(dbError("Failed to scan unmapped folders")(cause)),
          ),
        ),
      ),
    );
  });

  const startUnmappedScanLoop = Effect.fn("OperationsService.startUnmappedScanLoop")(function* () {
    const alreadyRunning = yield* coordination.tryStartUnmappedScan();

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

      const loop = Effect.gen(function* () {
        while (true) {
          yield* runUnmappedScanPass();

          const { queuedFolders: remainingQueuedFolders } = yield* loadQueuedUnmappedFolders();

          if (!remainingQueuedFolders.some(isUnmappedFolderQueuedForMatch)) {
            return;
          }

          yield* Effect.sleep("3 seconds");
        }
      }).pipe(
        Effect.catchAllCause((cause) =>
          Effect.logError("Unmapped scan loop failed").pipe(
            Effect.annotateLogs({ error: cause.toString() }),
          ),
        ),
        Effect.ensuring(coordination.finishUnmappedScan()),
      );

      yield* Effect.forkDaemon(loop);
      forked = true;

      return { folderCount };
    } finally {
      if (!forked) {
        yield* coordination.finishUnmappedScan();
      }
    }
  });

  const runUnmappedScan = Effect.fn("OperationsService.runUnmappedScan")(function* () {
    return yield* startUnmappedScanLoop();
  });

  const controlUnmappedFolder = Effect.fn("OperationsService.controlUnmappedFolder")(
    function* (input: { action: "pause" | "resume" | "reset" | "refresh"; path: string }) {
      const row = yield* loadUnmappedFolderMatchRow(db, input.path);

      if (!row) {
        return yield* new OperationsInputError({
          message: "Unmapped folder not found",
        });
      }

      const current = decodeUnmappedFolderMatchRow(row);

      if (current.match_status === "matching") {
        return yield* new OperationsConflictError({
          message: "Folder is currently matching in the background",
        });
      }

      let nextFolder = current;

      switch (input.action) {
        case "pause":
          nextFolder = markUnmappedFolderPaused(current);
          break;
        case "resume":
          nextFolder = markUnmappedFolderPending(current);
          break;
        case "reset":
          nextFolder = resetUnmappedFolderMatch(current);
          break;
        case "refresh":
          nextFolder = resetUnmappedFolderMatch(current);
          break;
      }

      yield* upsertUnmappedFolderMatchRows(db, [nextFolder]);

      if (input.action === "refresh") {
        const snapshot = yield* loadUnmappedFolderSnapshot({
          db,
          fs,
          tryDatabasePromise,
        });
        const target = snapshot.folders.find((folder) => folder.path === input.path);

        if (!target) {
          return yield* new OperationsInputError({
            message: "Unmapped folder not found",
          });
        }

        const matchingFolder = markUnmappedFolderMatching(target);
        yield* upsertUnmappedFolderMatchRows(db, [matchingFolder]);

        const matchResult = yield* Effect.either(
          matchSingleUnmappedFolder({
            aniList,
            animeRows: snapshot.animeRows,
            db,
            folder: matchingFolder,
          }),
        );

        if (matchResult._tag === "Left") {
          const errorMessage = toUnmappedMatchErrorMessage(matchResult.left);
          const now = yield* nowIso;
          const failedFolder = markUnmappedFolderFailed(matchingFolder, errorMessage, now);
          yield* upsertUnmappedFolderMatchRows(db, [failedFolder]);

          return yield* new OperationsConflictError({
            message: failedFolder.last_match_error ?? "Failed to refresh folder match",
          });
        }

        yield* upsertUnmappedFolderMatchRows(db, [matchResult.right]);

        yield* appendLog(
          db,
          "library.unmapped.control",
          "info",
          `refreshed unmapped folder ${current.name}`,
        );

        return { folderCount: 1, folderPath: input.path };
      }

      yield* appendLog(
        db,
        "library.unmapped.control",
        "info",
        `${input.action} unmapped folder ${current.name}`,
      );

      return { folderCount: 0, folderPath: input.path };
    },
  );

  const bulkControlUnmappedFolders = Effect.fn("OperationsService.bulkControlUnmappedFolders")(
    function* (input: {
      action: "pause_queued" | "resume_paused" | "reset_failed" | "retry_failed";
    }) {
      const rows = yield* listUnmappedFolderMatchRows(db);
      const folders = rows.map(decodeUnmappedFolderMatchRow);

      const nextFolders =
        input.action === "pause_queued"
          ? folders
              .filter((folder) => folder.match_status === "pending")
              .map((folder) => markUnmappedFolderPaused(folder))
          : input.action === "resume_paused"
            ? folders
                .filter((folder) => folder.match_status === "paused")
                .map((folder) => markUnmappedFolderPending(folder))
            : folders
                .filter((folder) => folder.match_status === "failed")
                .map((folder) => resetUnmappedFolderMatch(folder));

      if (nextFolders.length === 0) {
        return { affectedCount: 0 };
      }

      yield* upsertUnmappedFolderMatchRows(db, nextFolders);

      const logMessage =
        input.action === "pause_queued"
          ? `Paused ${nextFolders.length} queued unmapped folder(s)`
          : input.action === "resume_paused"
            ? `Queued ${nextFolders.length} paused unmapped folder(s)`
            : input.action === "reset_failed"
              ? `Reset ${nextFolders.length} failed unmapped folder(s)`
              : `Queued ${nextFolders.length} failed unmapped folder(s) for retry`;

      yield* appendLog(db, "library.unmapped.control.bulk", "info", logMessage);

      return { affectedCount: nextFolders.length };
    },
  );

  const importUnmappedFolder = Effect.fn("OperationsService.importUnmappedFolder")(
    function* (input: { folder_name: string; anime_id: number; profile_name?: string }) {
      const animeRow = yield* requireAnime(db, input.anime_id);
      const libraryPath = yield* getConfigLibraryPath(db);
      const folderName = yield* Effect.try({
        try: () => sanitizePathSegment(input.folder_name),
        catch: () =>
          new OperationsInputError({
            message: "folder_name must be a single folder name",
          }),
      });
      const folderPath = `${libraryPath.replace(/\/$/, "")}/${folderName}`;

      if (!isWithinPathRoot(folderPath, libraryPath)) {
        return yield* new OperationsInputError({
          message: "folder_name must stay within the library root",
        });
      }

      const existingOwner = yield* tryDatabasePromise("Failed to import unmapped folder", () =>
        db
          .select({ id: anime.id, titleRomaji: anime.titleRomaji })
          .from(anime)
          .where(eq(anime.rootFolder, folderPath))
          .limit(1),
      );

      if (existingOwner[0] && existingOwner[0].id !== input.anime_id) {
        return yield* new OperationsConflictError({
          message: `Folder ${folderName} is already mapped to ${existingOwner[0].titleRomaji}`,
        });
      }

      const rootFolder = yield* resolveAnimeRootFolderEffect(db, folderPath, animeRow.titleRomaji, {
        useExistingRoot: true,
      }).pipe(
        Effect.catchTag("StoredConfigCorruptError", (e) =>
          Effect.fail(
            new DatabaseError({
              message: "Failed to import unmapped folder",
              cause: e,
            }),
          ),
        ),
      );

      const requestedProfileName = input.profile_name?.trim();
      const nextProfileName =
        requestedProfileName && requestedProfileName.length > 0
          ? requestedProfileName
          : animeRow.profileName;

      const files = yield* scanVideoFiles(fs, folderPath).pipe(
        Effect.mapError(
          () =>
            new OperationsPathError({
              message: `Folder is inaccessible: ${folderPath}`,
            }),
        ),
      );

      yield* tryDatabasePromise("Failed to import unmapped folder", () =>
        db
          .update(anime)
          .set({
            profileName: nextProfileName,
            rootFolder,
          })
          .where(eq(anime.id, input.anime_id)),
      );

      if (animeRow.rootFolder !== rootFolder) {
        const previousEntries = yield* fs
          .readDir(animeRow.rootFolder)
          .pipe(Effect.catchTag("FileSystemError", () => Effect.succeed<DirEntry[]>([])));

        if (previousEntries.length === 0) {
          yield* fs.remove(animeRow.rootFolder, { recursive: true }).pipe(
            Effect.catchTag("FileSystemError", (fsError) =>
              Effect.logWarning("Failed to remove empty anime folder after import").pipe(
                Effect.annotateLogs({
                  error: String(fsError),
                  folder_path: animeRow.rootFolder,
                }),
                Effect.asVoid,
              ),
            ),
          );
        }
      }

      let imported = 0;

      for (const file of files) {
        const classification = classifyMediaArtifact(file.path, file.name);
        if (classification.kind === "extra" || classification.kind === "sample") {
          continue;
        }

        const parsed = parseFileSourceIdentity(file.path);
        const identity = parsed.source_identity;
        if (!identity || identity.scheme === "daily") {
          continue;
        }

        const episodeNumbers = identity.episode_numbers;
        if (episodeNumbers.length === 0) {
          continue;
        }

        const currentIso = yield* nowIso;

        for (const episodeNumber of episodeNumbers) {
          yield* upsertEpisodeEffect(db, input.anime_id, episodeNumber, {
            aired: inferAiredAt(
              animeRow.status,
              episodeNumber,
              animeRow.episodeCount ?? undefined,
              animeRow.startDate ?? undefined,
              animeRow.endDate ?? undefined,
              undefined,
              currentIso,
            ),
            downloaded: true,
            filePath: file.path,
            title: null,
          }).pipe(
            Effect.catchTag("UpsertEpisodeError", (e) =>
              Effect.fail(
                new DatabaseError({
                  message: "Failed to import unmapped folder",
                  cause: e,
                }),
              ),
            ),
          );
        }
        imported += episodeNumbers.length;
      }

      yield* appendLog(
        db,
        "library.unmapped.imported",
        "success",
        `Mapped ${folderName} as the root folder for anime ${input.anime_id} and imported ${imported} episode(s)`,
      );
    },
  );

  return {
    bulkControlUnmappedFolders,
    controlUnmappedFolder,
    getUnmappedFolders,
    importUnmappedFolder,
    runUnmappedScan,
  };
}
