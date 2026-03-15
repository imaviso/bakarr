import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Effect, Either, Stream } from "effect";

import type {
  CalendarEvent,
  Download,
  DownloadEvent,
  DownloadStatus,
  ImportResult,
  MissingEpisode,
  RenameResult,
  RssFeed,
} from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import {
  anime,
  downloadEvents,
  downloads,
  episodes,
  rssFeeds,
} from "../../db/schema.ts";
import { EventBus } from "../events/event-bus.ts";
import { buildRenamePreview } from "./library-import.ts";
import { scanVideoFilesStream } from "./file-scanner.ts";
import { upsertEpisodeFile, upsertEpisodeFiles } from "./download-support.ts";
import {
  classifyMediaArtifact,
  parseFileSourceIdentity,
} from "../../lib/media-identity.ts";
import {
  appendLog,
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
  nowIso,
  randomHex,
} from "./job-support.ts";
import {
  currentImportMode,
  requireAnime,
  toDownload,
  toDownloadEvent,
  toDownloadStatus,
  toRssFeed,
} from "./repository.ts";
import { type OperationsError } from "./errors.ts";
import type {
  TryDatabasePromise,
  TryOperationsPromise,
} from "./service-support.ts";
import {
  type FileSystemShape,
  sanitizeFilename,
} from "../../lib/filesystem.ts";

export function makeCatalogOrchestration(input: {
  db: AppDatabase;
  fs: FileSystemShape;
  eventBus: typeof EventBus.Service;
  tryDatabasePromise: TryDatabasePromise;
  tryOperationsPromise: TryOperationsPromise;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  applyDownloadActionEffect: (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles?: boolean,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  retryDownloadById: (
    id: number,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  reconcileDownloadByIdEffect: (
    id: number,
  ) => Effect.Effect<void, OperationsError | DatabaseError>;
  syncDownloadState: (trigger: string) => Effect.Effect<void, DatabaseError>;
  publishDownloadProgress: () => Effect.Effect<void, DatabaseError>;
  publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
}) {
  const {
    db,
    fs,
    eventBus,
    tryDatabasePromise,
    tryOperationsPromise,
    dbError,
    applyDownloadActionEffect,
    retryDownloadById,
    reconcileDownloadByIdEffect,
    syncDownloadState,
    publishDownloadProgress,
    publishLibraryScanProgress,
  } = input;

  const renameFiles = Effect.fn("OperationsService.renameFiles")(
    function* (animeId: number) {
      const animeRow = yield* tryOperationsPromise(
        "Failed to rename files",
        () => requireAnime(db, animeId),
      );
      const preview = yield* tryOperationsPromise(
        "Failed to rename files",
        () => buildRenamePreview(db, animeId),
      );
      let renamed = 0;
      const failures: string[] = [];

      for (const item of preview) {
        const result = yield* fs.rename(item.current_path, item.new_path).pipe(
          Effect.mapError(dbError("Failed to rename files")),
          Effect.zipRight(
            tryOperationsPromise(
              "Failed to rename files",
              () =>
                db.update(episodes).set({ filePath: item.new_path }).where(
                  and(
                    eq(episodes.animeId, animeId),
                    eq(episodes.number, item.episode_number),
                  ),
                ),
            ).pipe(
              Effect.catchAll((error) =>
                fs.rename(item.new_path, item.current_path).pipe(
                  Effect.catchTag("FileSystemError", () => Effect.void),
                  Effect.zipRight(Effect.fail(error)),
                )
              ),
            ),
          ),
          Effect.either,
        );

        if (Either.isRight(result)) {
          renamed += 1;
        } else {
          failures.push(
            result.left instanceof Error
              ? result.left.message
              : String(result.left),
          );
        }
      }

      yield* eventBus.publish({
        type: "RenameFinished",
        payload: {
          anime_id: animeId,
          count: renamed,
          title: animeRow.titleRomaji,
        },
      });

      return {
        failed: failures.length,
        failures,
        renamed,
      } satisfies RenameResult;
    },
  );

  const importFilesRaw = Effect.fn("OperationsService.importFiles")(function* (
    files: readonly {
      source_path: string;
      anime_id: number;
      episode_number: number;
      episode_numbers?: readonly number[];
      season?: number;
    }[],
  ) {
    const importedFiles: ImportResult["imported_files"] = [];
    const failedFiles: ImportResult["failed_files"] = [];

    const importMode = yield* tryDatabasePromise(
      "Failed to import files",
      () => currentImportMode(db),
    );

    for (const file of files) {
      const result = yield* Effect.gen(function* () {
        const resolvedSource = yield* fs.realPath(file.source_path).pipe(
          Effect.mapError((error) =>
            new DatabaseError({
              cause: error,
              message: "Failed to import files",
            })
          ),
        );

        const animeRow = yield* tryOperationsPromise(
          "Failed to import files",
          () => requireAnime(db, file.anime_id),
        );
        const extension = file.source_path.includes(".")
          ? file.source_path.slice(file.source_path.lastIndexOf("."))
          : ".mkv";
        const destination = `${animeRow.rootFolder.replace(/\/$/, "")}/${
          sanitizeFilename(animeRow.titleRomaji)
        } - ${String(file.episode_number).padStart(2, "0")}${extension}`;

        yield* fs.mkdir(animeRow.rootFolder, { recursive: true }).pipe(
          Effect.mapError((error) =>
            new DatabaseError({
              cause: error,
              message: "Failed to import files",
            })
          ),
        );

        if (importMode === "move") {
          yield* fs.rename(resolvedSource, destination).pipe(
            Effect.mapError((error) =>
              new DatabaseError({
                cause: error,
                message: "Failed to import files",
              })
            ),
          );
        } else {
          yield* fs.copyFile(resolvedSource, destination).pipe(
            Effect.mapError((error) =>
              new DatabaseError({
                cause: error,
                message: "Failed to import files",
              })
            ),
          );
        }

        // Upsert all covered episode numbers (multi-episode support)
        const allEpisodeNumbers = file.episode_numbers?.length
          ? file.episode_numbers
          : [file.episode_number];

        for (const epNum of allEpisodeNumbers) {
          yield* tryDatabasePromise(
            "Failed to import files",
            () =>
              upsertEpisodeFile(
                db,
                file.anime_id,
                epNum,
                destination,
              ),
          ).pipe(
            Effect.catchAll((error) =>
              (importMode === "move"
                ? fs.rename(destination, resolvedSource)
                : fs.remove(destination)).pipe(
                  Effect.catchTag("FileSystemError", () => Effect.void),
                  Effect.zipRight(Effect.fail(error)),
                )
            ),
          );
        }

        importedFiles.push({
          anime_id: file.anime_id,
          destination_path: destination,
          episode_number: file.episode_number,
          episode_numbers: file.episode_numbers
            ? [...file.episode_numbers]
            : undefined,
          source_path: file.source_path,
        });
      }).pipe(Effect.either);

      if (Either.isLeft(result)) {
        failedFiles.push({
          source_path: file.source_path,
          error: result.left instanceof Error
            ? result.left.message
            : String(result.left),
        });
      }
    }

    yield* eventBus.publish({
      type: "ImportFinished",
      payload: {
        count: files.length,
        imported: importedFiles.length,
        failed: failedFiles.length,
      },
    });

    return {
      imported: importedFiles.length,
      failed: failedFiles.length,
      imported_files: importedFiles,
      failed_files: failedFiles,
    } satisfies ImportResult;
  });

  const importFiles = (
    files: readonly {
      source_path: string;
      anime_id: number;
      episode_number: number;
      episode_numbers?: readonly number[];
      season?: number;
    }[],
  ) =>
    importFilesRaw(files).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError
          ? error
          : dbError("Failed to import files")(error)
      ),
    );

  const retryDownload = Effect.fn("OperationsService.retryDownload")(
    function* (id: number) {
      yield* retryDownloadById(id);
      yield* publishDownloadProgress();
    },
  );

  const reconcileDownload = Effect.fn(
    "OperationsService.reconcileDownload",
  )(function* (id: number) {
    yield* reconcileDownloadByIdEffect(id);
    yield* publishDownloadProgress();
  });

  const syncDownloads = Effect.fn("OperationsService.syncDownloads")(
    function* () {
      yield* syncDownloadState("downloads.manual_sync");
      yield* publishDownloadProgress();
    },
  );

  const listRssFeeds = Effect.fn("OperationsService.listRssFeeds")(
    function* () {
      const rows = yield* tryDatabasePromise(
        "Failed to list RSS feeds",
        () => db.select().from(rssFeeds).orderBy(desc(rssFeeds.id)),
      );
      return rows.map(toRssFeed) as RssFeed[];
    },
  );

  const listAnimeRssFeeds = Effect.fn(
    "OperationsService.listAnimeRssFeeds",
  )(function* (animeId: number) {
    const rows = yield* tryDatabasePromise(
      "Failed to list anime RSS feeds",
      () => db.select().from(rssFeeds).where(eq(rssFeeds.animeId, animeId)),
    );
    return rows.map(toRssFeed) as RssFeed[];
  });

  const addRssFeed = Effect.fn("OperationsService.addRssFeed")(
    function* (input: { anime_id: number; url: string; name?: string }) {
      yield* tryOperationsPromise(
        "Failed to add RSS feed",
        () => requireAnime(db, input.anime_id),
      );
      const [row] = yield* tryOperationsPromise(
        "Failed to add RSS feed",
        () =>
          db.insert(rssFeeds).values({
            animeId: input.anime_id,
            createdAt: nowIso(),
            enabled: true,
            lastChecked: null,
            name: input.name ?? null,
            url: input.url,
          }).returning(),
      );
      yield* tryDatabasePromise("Failed to add RSS feed", () =>
        appendLog(
          db,
          "rss.created",
          "success",
          `RSS feed added for anime ${input.anime_id}`,
        ));
      return toRssFeed(row);
    },
  );

  const deleteRssFeed = Effect.fn("OperationsService.deleteRssFeed")(
    function* (id: number) {
      yield* tryDatabasePromise(
        "Failed to delete RSS feed",
        () => db.delete(rssFeeds).where(eq(rssFeeds.id, id)),
      );
    },
  );

  const toggleRssFeed = Effect.fn("OperationsService.toggleRssFeed")(
    function* (id: number, enabled: boolean) {
      yield* tryDatabasePromise(
        "Failed to toggle RSS feed",
        () => db.update(rssFeeds).set({ enabled }).where(eq(rssFeeds.id, id)),
      );
    },
  );

  const getWantedMissing = Effect.fn("OperationsService.getWantedMissing")(
    function* (limit: number) {
      const rows = yield* tryDatabasePromise(
        "Failed to load wanted episodes",
        () =>
          db.select({
            animeId: anime.id,
            animeTitle: anime.titleRomaji,
            coverImage: anime.coverImage,
            episodeNumber: episodes.number,
            title: episodes.title,
            aired: episodes.aired,
          }).from(episodes).innerJoin(anime, eq(anime.id, episodes.animeId))
            .where(
              and(
                eq(episodes.downloaded, false),
                sql`${episodes.aired} is not null`,
                sql`${episodes.aired} <= ${nowIso()}`,
              ),
            ).limit(Math.max(1, limit)),
      );

      return rows.map((row) => ({
        aired: row.aired ?? undefined,
        anime_id: row.animeId,
        anime_image: row.coverImage ?? undefined,
        anime_title: row.animeTitle,
        episode_number: row.episodeNumber,
        episode_title: row.title ?? undefined,
      })) as MissingEpisode[];
    },
  );

  const getCalendar = Effect.fn("OperationsService.getCalendar")(
    function* (start: string, end: string) {
      const rows = yield* tryDatabasePromise(
        "Failed to load calendar events",
        () =>
          db.select().from(episodes).innerJoin(
            anime,
            eq(anime.id, episodes.animeId),
          ).where(
            and(
              sql`${episodes.aired} >= ${start}`,
              sql`${episodes.aired} <= ${end}`,
            ),
          ),
      );

      return rows.map(({ anime: animeRow, episodes: episodeRow }) => ({
        all_day: true,
        end: episodeRow.aired ?? new Date().toISOString(),
        extended_props: {
          anime_id: animeRow.id,
          anime_image: animeRow.coverImage ?? undefined,
          anime_title: animeRow.titleRomaji,
          downloaded: episodeRow.downloaded,
          episode_number: episodeRow.number,
        },
        id: `${animeRow.id}-${episodeRow.number}`,
        start: episodeRow.aired ?? new Date().toISOString(),
        title: `${animeRow.titleRomaji} - Episode ${episodeRow.number}`,
      })) as CalendarEvent[];
    },
  );

  const getRenamePreview = Effect.fn("OperationsService.getRenamePreview")(
    function* (animeId: number) {
      return yield* tryOperationsPromise(
        "Failed to build rename preview",
        () => buildRenamePreview(db, animeId),
      );
    },
  );

  const pauseDownload = (id: number) => applyDownloadActionEffect(id, "pause");
  const resumeDownload = (id: number) =>
    applyDownloadActionEffect(id, "resume");
  const removeDownload = (id: number, deleteFiles: boolean) =>
    applyDownloadActionEffect(id, "delete", deleteFiles);

  const listDownloadEvents = Effect.fn("OperationsService.listDownloadEvents")(
    function* (input: {
      animeId?: number;
      downloadId?: number;
      eventType?: string;
      limit?: number;
    } = {}) {
      const limit = Math.max(1, Math.min(input.limit ?? 100, 1000));
      const conditions = [
        input.animeId ? eq(downloadEvents.animeId, input.animeId) : undefined,
        input.downloadId
          ? eq(downloadEvents.downloadId, input.downloadId)
          : undefined,
        input.eventType
          ? eq(downloadEvents.eventType, input.eventType)
          : undefined,
      ].filter((value): value is Exclude<typeof value, undefined> =>
        value !== undefined
      );
      const query = db.select().from(downloadEvents).orderBy(
        desc(downloadEvents.id),
      ).limit(limit);
      const rows = yield* tryDatabasePromise(
        "Failed to load download events",
        () => conditions.length > 0 ? query.where(and(...conditions)) : query,
      );
      return rows.map(toDownloadEvent) as DownloadEvent[];
    },
  );

  const listDownloadQueue = Effect.fn("OperationsService.listDownloadQueue")(
    function* () {
      const rows = yield* tryDatabasePromise(
        "Failed to list download queue",
        () =>
          db.select().from(downloads).where(
            inArray(downloads.status, ["queued", "downloading", "paused"]),
          ).orderBy(desc(downloads.id)),
      );
      return rows.map(toDownload) as Download[];
    },
  );

  const listDownloadHistory = Effect.fn(
    "OperationsService.listDownloadHistory",
  )(
    function* () {
      const rows = yield* tryDatabasePromise(
        "Failed to list download history",
        () => db.select().from(downloads).orderBy(desc(downloads.id)),
      );
      return rows.map(toDownload) as Download[];
    },
  );

  const getDownloadProgress = Effect.fn(
    "OperationsService.getDownloadProgress",
  )(
    function* () {
      const rows = yield* tryDatabasePromise(
        "Failed to build download progress snapshot",
        () =>
          db.select().from(downloads).where(
            inArray(downloads.status, ["queued", "downloading", "paused"]),
          ).orderBy(desc(downloads.id)),
      );
      return rows.map((row) =>
        toDownloadStatus(row, () => randomHex(20))
      ) as DownloadStatus[];
    },
  );

  const runLibraryScan = Effect.fn("OperationsService.runLibraryScan")(
    function* () {
      yield* tryDatabasePromise(
        "Failed to run library scan",
        () => markJobStarted(db, "library_scan"),
      );

      return yield* Effect.gen(function* () {
        const animeRows = yield* tryDatabasePromise(
          "Failed to run library scan",
          () => db.select().from(anime),
        );
        let scanned = 0;
        let matched = 0;

        yield* eventBus.publish({ type: "LibraryScanStarted" });

        for (const animeRow of animeRows) {
          const { scannedFiles, matchedFiles } = yield* scanVideoFilesStream(
            fs,
            animeRow.rootFolder,
          ).pipe(
            Stream.runFoldEffect(
              { matchedFiles: 0, scannedFiles: 0 },
              (counts, file) =>
                Effect.gen(function* () {
                  // Skip extras and samples
                  const classification = classifyMediaArtifact(
                    file.path,
                    file.name,
                  );
                  if (
                    classification.kind === "extra" ||
                    classification.kind === "sample"
                  ) {
                    return {
                      matchedFiles: counts.matchedFiles,
                      scannedFiles: counts.scannedFiles + 1,
                    };
                  }

                  // Parse with canonical parser
                  const parsed = parseFileSourceIdentity(file.path);
                  const identity = parsed.source_identity;

                  if (!identity || identity.scheme === "daily") {
                    return {
                      matchedFiles: counts.matchedFiles,
                      scannedFiles: counts.scannedFiles + 1,
                    };
                  }

                  const episodeNumbers = identity.episode_numbers;
                  if (episodeNumbers.length === 0) {
                    return {
                      matchedFiles: counts.matchedFiles,
                      scannedFiles: counts.scannedFiles + 1,
                    };
                  }

                  // Upsert all covered episode numbers for multi-episode files
                  yield* tryDatabasePromise(
                    "Failed to run library scan",
                    () =>
                      upsertEpisodeFiles(
                        db,
                        animeRow.id,
                        episodeNumbers,
                        file.path,
                      ),
                  );

                  return {
                    matchedFiles: counts.matchedFiles + episodeNumbers.length,
                    scannedFiles: counts.scannedFiles + 1,
                  };
                }),
            ),
          );
          scanned += scannedFiles;
          matched += matchedFiles;
          yield* publishLibraryScanProgress(scanned);
        }

        yield* tryDatabasePromise(
          "Failed to run library scan",
          () =>
            markJobSucceeded(
              db,
              "library_scan",
              `Scanned ${scanned} file(s), matched ${matched}`,
            ),
        );
        yield* eventBus.publish({
          type: "LibraryScanFinished",
          payload: { matched, scanned },
        });

        return { matched, scanned };
      }).pipe(
        Effect.catchAll((cause) =>
          tryDatabasePromise(
            "Failed to run library scan",
            () => markJobFailed(db, "library_scan", cause),
          ).pipe(
            Effect.zipRight(
              Effect.fail(dbError("Failed to run library scan")(cause)),
            ),
          )
        ),
      );
    },
  );

  return {
    addRssFeed,
    deleteRssFeed,
    getCalendar,
    getDownloadProgress,
    getRenamePreview,
    getWantedMissing,
    importFiles,
    listAnimeRssFeeds,
    listDownloadEvents,
    listDownloadHistory,
    listDownloadQueue,
    listRssFeeds,
    pauseDownload,
    reconcileDownload,
    removeDownload,
    renameFiles,
    resumeDownload,
    retryDownload,
    runLibraryScan,
    syncDownloads,
    toggleRssFeed,
  };
}
