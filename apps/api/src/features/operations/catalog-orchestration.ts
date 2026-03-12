import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

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
import { buildRenamePreview, parseEpisodeNumber } from "./library-import.ts";
import { scanVideoFilesIterator } from "./file-scanner.ts";
import { upsertEpisodeFile } from "./download-support.ts";
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
  loadRuntimeConfig,
  requireAnime,
  toDownload,
  toDownloadEvent,
  toDownloadStatus,
  toRssFeed,
} from "./repository.ts";
import { type OperationsError } from "./errors.ts";
import {
  type FileSystemShape,
  isWithinPathRoot,
} from "../../lib/filesystem.ts";
import { Effect as Ef } from "effect";

type TryDatabasePromise = <A>(
  message: string,
  try_: () => Promise<A>,
) => Effect.Effect<A, DatabaseError>;

type TryOperationsPromise = <A>(
  message: string,
  try_: () => Promise<A>,
) => Effect.Effect<A, OperationsError | DatabaseError>;

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
  } = input;

  const renameFiles = (animeId: number) =>
    Effect.fn("OperationsService.renameFiles")(function* () {
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
        try {
          yield* tryOperationsPromise("Failed to rename files", async () => {
            await Ef.runPromise(fs.rename(item.current_path, item.new_path));
            await db.update(episodes).set({ filePath: item.new_path }).where(
              and(
                eq(episodes.animeId, animeId),
                eq(episodes.number, item.episode_number),
              ),
            );
          });
          renamed += 1;
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
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
    })();

  const importFilesRaw = Effect.fn("OperationsService.importFiles")(function* (
    files: readonly {
      source_path: string;
      anime_id: number;
      episode_number: number;
      season?: number;
    }[],
  ) {
    const importedFiles: ImportResult["imported_files"] = [];
    const failedFiles: ImportResult["failed_files"] = [];

    const runtimeConfig = yield* tryOperationsPromise(
      "Failed to load config",
      () => loadRuntimeConfig(db),
    );
    const importMode = yield* tryDatabasePromise(
      "Failed to import files",
      () => currentImportMode(db),
    );
    const downloadRoot = yield* fs.realPath(runtimeConfig.downloads.root_path)
      .pipe(
        Effect.mapError((error) =>
          new DatabaseError({ cause: error, message: "Failed to import files" })
        ),
      );
    const libraryRoot = yield* fs.realPath(runtimeConfig.library.library_path)
      .pipe(
        Effect.mapError((error) =>
          new DatabaseError({ cause: error, message: "Failed to import files" })
        ),
      );

    for (const file of files) {
      try {
        const resolvedSource = yield* fs.realPath(file.source_path).pipe(
          Effect.mapError((error) =>
            new DatabaseError({
              cause: error,
              message: "Failed to import files",
            })
          ),
        );

        if (
          !isWithinPathRoot(resolvedSource, downloadRoot) &&
          !isWithinPathRoot(resolvedSource, libraryRoot)
        ) {
          throw new Error(
            "Source path is not within allowed download or library directories",
          );
        }

        const animeRow = yield* tryOperationsPromise(
          "Failed to import files",
          () => requireAnime(db, file.anime_id),
        );
        const extension = file.source_path.includes(".")
          ? file.source_path.slice(file.source_path.lastIndexOf("."))
          : ".mkv";
        const destination = `${
          animeRow.rootFolder.replace(/\/$/, "")
        }/${animeRow.titleRomaji} - ${
          String(file.episode_number).padStart(2, "0")
        }${extension}`;

        yield* tryDatabasePromise(
          "Failed to import files",
          () =>
            Ef.runPromise(fs.mkdir(animeRow.rootFolder, { recursive: true })),
        );

        if (importMode === "move") {
          yield* tryDatabasePromise(
            "Failed to import files",
            () => Ef.runPromise(fs.rename(resolvedSource, destination)),
          );
        } else {
          yield* tryDatabasePromise(
            "Failed to import files",
            () => Ef.runPromise(fs.copyFile(resolvedSource, destination)),
          );
        }

        yield* tryDatabasePromise(
          "Failed to import files",
          () =>
            upsertEpisodeFile(
              db,
              file.anime_id,
              file.episode_number,
              destination,
            ),
        );
        importedFiles.push({
          anime_id: file.anime_id,
          destination_path: destination,
          episode_number: file.episode_number,
          source_path: file.source_path,
        });
      } catch (error) {
        failedFiles.push({
          source_path: file.source_path,
          error: error instanceof Error ? error.message : String(error),
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
      season?: number;
    }[],
  ) =>
    importFilesRaw(files).pipe(
      Effect.catchAll((error) =>
        Effect.fail(
          error instanceof DatabaseError
            ? error
            : dbError("Failed to import files")(error),
        )
      ),
    );

  const retryDownload = (id: number) =>
    Effect.fn("OperationsService.retryDownload")(function* () {
      yield* retryDownloadById(id);
      yield* publishDownloadProgress();
    })();

  const reconcileDownload = (id: number) =>
    Effect.fn("OperationsService.reconcileDownload")(function* () {
      yield* reconcileDownloadByIdEffect(id);
      yield* publishDownloadProgress();
    })();

  const syncDownloads = () =>
    Effect.fn("OperationsService.syncDownloads")(function* () {
      yield* syncDownloadState("downloads.manual_sync");
      yield* publishDownloadProgress();
    })();

  const listRssFeeds = () =>
    Effect.fn("OperationsService.listRssFeeds")(function* () {
      const rows = yield* tryDatabasePromise(
        "Failed to list RSS feeds",
        () => db.select().from(rssFeeds).orderBy(desc(rssFeeds.id)),
      );
      return rows.map(toRssFeed) as RssFeed[];
    })();

  const listAnimeRssFeeds = (animeId: number) =>
    Effect.fn("OperationsService.listAnimeRssFeeds")(function* () {
      const rows = yield* tryDatabasePromise(
        "Failed to list anime RSS feeds",
        () => db.select().from(rssFeeds).where(eq(rssFeeds.animeId, animeId)),
      );
      return rows.map(toRssFeed) as RssFeed[];
    })();

  const addRssFeed = (
    input: { anime_id: number; url: string; name?: string },
  ) =>
    Effect.fn("OperationsService.addRssFeed")(function* () {
      yield* tryOperationsPromise("Failed to add RSS feed", () =>
        requireAnime(db, input.anime_id));
      const [row] = yield* tryOperationsPromise("Failed to add RSS feed", () =>
        db.insert(rssFeeds).values({
          animeId: input.anime_id,
          createdAt: nowIso(),
          enabled: true,
          lastChecked: null,
          name: input.name ?? null,
          url: input.url,
        }).returning());
      yield* tryDatabasePromise("Failed to add RSS feed", () =>
        appendLog(
          db,
          "rss.created",
          "success",
          `RSS feed added for anime ${input.anime_id}`,
        ));
      return toRssFeed(row);
    })();

  const deleteRssFeed = (id: number) =>
    Effect.fn("OperationsService.deleteRssFeed")(function* () {
      yield* tryDatabasePromise(
        "Failed to delete RSS feed",
        () => db.delete(rssFeeds).where(eq(rssFeeds.id, id)),
      );
    })();

  const toggleRssFeed = (id: number, enabled: boolean) =>
    Effect.fn("OperationsService.toggleRssFeed")(function* () {
      yield* tryDatabasePromise(
        "Failed to toggle RSS feed",
        () => db.update(rssFeeds).set({ enabled }).where(eq(rssFeeds.id, id)),
      );
    })();

  const getWantedMissing = (limit: number) =>
    Effect.fn("OperationsService.getWantedMissing")(function* () {
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
              eq(episodes.downloaded, false),
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
    })();

  const getCalendar = (start: string, end: string) =>
    Effect.fn("OperationsService.getCalendar")(function* () {
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
    })();

  const getRenamePreview = (animeId: number) =>
    Effect.fn("OperationsService.getRenamePreview")(function* () {
      return yield* tryOperationsPromise(
        "Failed to build rename preview",
        () => buildRenamePreview(db, animeId),
      );
    })();

  const pauseDownload = (id: number) => applyDownloadActionEffect(id, "pause");
  const resumeDownload = (id: number) =>
    applyDownloadActionEffect(id, "resume");
  const removeDownload = (id: number, deleteFiles: boolean) =>
    applyDownloadActionEffect(id, "delete", deleteFiles);

  const listDownloadEvents = (input: {
    animeId?: number;
    downloadId?: number;
    eventType?: string;
    limit?: number;
  } = {}) =>
    Effect.fn("OperationsService.listDownloadEvents")(function* () {
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
    })();

  const listDownloadQueue = () =>
    Effect.fn("OperationsService.listDownloadQueue")(function* () {
      yield* syncDownloadState("downloads.queue");
      const rows = yield* tryDatabasePromise(
        "Failed to list download queue",
        () =>
          db.select().from(downloads).where(
            inArray(downloads.status, ["queued", "downloading", "paused"]),
          ).orderBy(desc(downloads.id)),
      );
      return rows.map(toDownload) as Download[];
    })();

  const listDownloadHistory = () =>
    Effect.fn("OperationsService.listDownloadHistory")(function* () {
      yield* syncDownloadState("downloads.history");
      const rows = yield* tryDatabasePromise(
        "Failed to list download history",
        () => db.select().from(downloads).orderBy(desc(downloads.id)),
      );
      return rows.map(toDownload) as Download[];
    })();

  const getDownloadProgress = () =>
    Effect.fn("OperationsService.getDownloadProgress")(function* () {
      yield* syncDownloadState("downloads.progress");
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
    })();

  const runLibraryScan = () =>
    Effect.fn("OperationsService.runLibraryScan")(function* () {
      yield* tryDatabasePromise(
        "Failed to run library scan",
        () => markJobStarted(db, "library_scan"),
      );

      try {
        const animeRows = yield* tryDatabasePromise(
          "Failed to run library scan",
          () => db.select().from(anime),
        );
        let scanned = 0;
        let matched = 0;

        yield* eventBus.publish({ type: "LibraryScanStarted" });

        for (const animeRow of animeRows) {
          const { scannedFiles, matchedFiles } = yield* tryDatabasePromise(
            "Failed to run library scan",
            async () => {
              let s = 0, m = 0;

              for await (
                const file of scanVideoFilesIterator(
                  fs,
                  animeRow.rootFolder,
                )
              ) {
                s++;
                const episodeNumber = parseEpisodeNumber(file.path);
                if (episodeNumber) {
                  await upsertEpisodeFile(
                    db,
                    animeRow.id,
                    episodeNumber,
                    file.path,
                  );
                  m++;
                }
              }
              return { scannedFiles: s, matchedFiles: m };
            },
          );
          scanned += scannedFiles;
          matched += matchedFiles;
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
      } catch (cause) {
        yield* tryDatabasePromise(
          "Failed to run library scan",
          () => markJobFailed(db, "library_scan", cause),
        );
        return yield* Effect.fail(dbError("Failed to run library scan")(cause));
      }
    })();

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
