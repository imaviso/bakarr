import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { Effect, Either, Stream } from "effect";

import type {
  CalendarEvent,
  Download,
  DownloadEvent,
  DownloadEventsExport,
  DownloadEventsPage,
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
import { deriveEpisodeTimelineMetadata } from "../anime/query-support.ts";
import { buildRenamePreview } from "./library-import.ts";
import {
  buildEpisodeFilenamePlan,
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
} from "./naming-support.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import { scanVideoFilesStream } from "./file-scanner.ts";
import { upsertEpisodeFilesAtomic } from "./download-support.ts";
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
  currentNamingSettings,
  loadDownloadEventPresentationContexts,
  loadDownloadPresentationContexts,
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
import { type FileSystemShape } from "../../lib/filesystem.ts";
import { OperationsPathError } from "./errors.ts";

export function makeCatalogOrchestration(input: {
  db: AppDatabase;
  fs: FileSystemShape;
  mediaProbe: MediaProbeShape;
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
    mediaProbe,
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
          Effect.mapError(() =>
            new OperationsPathError({
              message: `Failed to rename file ${item.current_path}`,
            })
          ),
          Effect.zipRight(
            tryOperationsPromise(
              "Failed to rename files",
              () =>
                db.update(episodes).set({ filePath: item.new_path }).where(
                  and(
                    eq(episodes.animeId, animeId),
                    item.episode_numbers?.length
                      ? inArray(episodes.number, item.episode_numbers)
                      : eq(episodes.number, item.episode_number),
                  ),
                ),
            ).pipe(
              Effect.catchAll((error) =>
                fs.rename(item.new_path, item.current_path).pipe(
                  Effect.catchTag(
                    "FileSystemError",
                    (fsError) =>
                      Effect.logWarning(
                        "Failed to rollback rename after DB error",
                      ).pipe(
                        Effect.annotateLogs({
                          current_path: item.current_path,
                          error: String(fsError),
                          new_path: item.new_path,
                        }),
                        Effect.asVoid,
                      ),
                  ),
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
      source_metadata?:
        import("../../../../../packages/shared/src/index.ts").DownloadSourceMetadata;
    }[],
  ) {
    const importedFiles: ImportResult["imported_files"] = [];
    const failedFiles: ImportResult["failed_files"] = [];

    const importMode = yield* tryDatabasePromise(
      "Failed to import files",
      () => currentImportMode(db),
    );
    const namingSettings = yield* tryDatabasePromise(
      "Failed to import files",
      () => currentNamingSettings(db),
    );

    for (const file of files) {
      const result = yield* Effect.gen(function* () {
        const resolvedSource = yield* fs.realPath(file.source_path).pipe(
          Effect.mapError(() =>
            new OperationsPathError({
              message: `Source path is inaccessible: ${file.source_path}`,
            })
          ),
        );

        const animeRow = yield* tryOperationsPromise(
          "Failed to import files",
          () => requireAnime(db, file.anime_id),
        );
        const namingFormat = selectNamingFormat(animeRow, namingSettings);
        const allEpisodeNumbers = file.episode_numbers?.length
          ? file.episode_numbers
          : [file.episode_number];
        const episodeRows = yield* tryDatabasePromise(
          "Failed to import files",
          () =>
            db.select({ aired: episodes.aired, title: episodes.title }).from(
              episodes,
            ).where(
              and(
                eq(episodes.animeId, file.anime_id),
                inArray(episodes.number, allEpisodeNumbers as number[]),
              ),
            ),
        );
        const extension = file.source_path.includes(".")
          ? file.source_path.slice(file.source_path.lastIndexOf("."))
          : ".mkv";
        const initialNamingPlan = buildEpisodeFilenamePlan({
          animeRow,
          downloadSourceMetadata: file.source_metadata,
          episodeNumbers: allEpisodeNumbers,
          episodeRows,
          filePath: file.source_path,
          namingFormat,
          preferredTitle: namingSettings.preferredTitle,
          season: file.season,
        });
        const localMediaMetadata = hasMissingLocalMediaNamingFields(
            initialNamingPlan.missingFields,
          )
          ? yield* mediaProbe.probeVideoFile(file.source_path)
          : undefined;
        const namingPlan = localMediaMetadata
          ? buildEpisodeFilenamePlan({
            animeRow,
            downloadSourceMetadata: file.source_metadata,
            episodeNumbers: allEpisodeNumbers,
            episodeRows,
            filePath: file.source_path,
            localMediaMetadata,
            namingFormat,
            preferredTitle: namingSettings.preferredTitle,
            season: file.season,
          })
          : initialNamingPlan;
        const destinationBaseName = namingPlan.baseName;
        const destination = `${
          animeRow.rootFolder.replace(/\/$/, "")
        }/${destinationBaseName}${extension}`;

        yield* fs.mkdir(animeRow.rootFolder, { recursive: true }).pipe(
          Effect.mapError(() =>
            new OperationsPathError({
              message:
                `Failed to create or access destination folder ${animeRow.rootFolder}`,
            })
          ),
        );

        if (importMode === "move") {
          yield* fs.rename(resolvedSource, destination).pipe(
            Effect.mapError(() =>
              new OperationsPathError({
                message:
                  `Failed to move file into library: ${file.source_path}`,
              })
            ),
          );
        } else {
          yield* fs.copyFile(resolvedSource, destination).pipe(
            Effect.mapError(() =>
              new OperationsPathError({
                message:
                  `Failed to copy file into library: ${file.source_path}`,
              })
            ),
          );
        }

        const dbResult = yield* Effect.tryPromise({
          try: () =>
            upsertEpisodeFilesAtomic(
              db,
              file.anime_id,
              allEpisodeNumbers,
              destination,
            ),
          catch: (cause) =>
            new DatabaseError({
              cause,
              message: "Failed to import episode files atomically",
            }),
        }).pipe(Effect.either);

        if (Either.isLeft(dbResult)) {
          const rollbackEffect = importMode === "move"
            ? fs.rename(destination, resolvedSource)
            : fs.remove(destination);

          yield* rollbackEffect.pipe(
            Effect.catchTag(
              "FileSystemError",
              (error) =>
                Effect.logWarning(
                  "Failed to rollback filesystem after DB error",
                ).pipe(
                  Effect.annotateLogs({
                    destination_path: destination,
                    source_path: file.source_path,
                    error: String(error),
                  }),
                ),
            ),
          );

          return yield* dbResult.left;
        }

        importedFiles.push({
          anime_id: file.anime_id,
          destination_path: destination,
          episode_number: file.episode_number,
          episode_numbers: file.episode_numbers
            ? [...file.episode_numbers]
            : undefined,
          naming_fallback_used: namingPlan.fallbackUsed || undefined,
          naming_format_used: namingPlan.formatUsed,
          naming_metadata_snapshot: namingPlan.metadataSnapshot,
          naming_missing_fields: namingPlan.missingFields.length > 0
            ? [...namingPlan.missingFields]
            : undefined,
          naming_warnings: namingPlan.warnings.length > 0
            ? [...namingPlan.warnings]
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
            nextAiringAt: anime.nextAiringAt,
            nextAiringEpisode: anime.nextAiringEpisode,
            episodeNumber: episodes.number,
            title: episodes.title,
            aired: episodes.aired,
          }).from(episodes).innerJoin(anime, eq(anime.id, episodes.animeId))
            .where(
              and(
                eq(anime.monitored, true),
                eq(episodes.downloaded, false),
                sql`${episodes.aired} is not null`,
                sql`${episodes.aired} <= ${nowIso()}`,
              ),
            ).orderBy(episodes.aired, anime.titleRomaji).limit(
              Math.max(1, limit),
            ),
      );

      return rows.map((row) => {
        const timeline = deriveEpisodeTimelineMetadata(row.aired ?? undefined);

        return {
          aired: row.aired ?? undefined,
          airing_status: timeline.airing_status,
          anime_id: row.animeId,
          anime_image: row.coverImage ?? undefined,
          anime_title: row.animeTitle,
          episode_number: row.episodeNumber,
          episode_title: row.title ?? undefined,
          is_future: timeline.is_future,
          next_airing_episode: row.nextAiringAt && row.nextAiringEpisode
            ? {
              airing_at: row.nextAiringAt,
              episode: row.nextAiringEpisode,
            }
            : undefined,
        } satisfies MissingEpisode;
      });
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
          ).orderBy(episodes.aired, anime.titleRomaji),
      );

      return rows.map(({ anime: animeRow, episodes: episodeRow }) => {
        const timeline = deriveEpisodeTimelineMetadata(
          episodeRow.aired ?? undefined,
        );

        return {
          all_day: isAllDayAiring(episodeRow.aired),
          end: episodeRow.aired ?? new Date().toISOString(),
          extended_props: {
            airing_status: timeline.airing_status,
            anime_id: animeRow.id,
            anime_image: animeRow.coverImage ?? undefined,
            anime_title: animeRow.titleRomaji,
            downloaded: episodeRow.downloaded,
            episode_number: episodeRow.number,
            episode_title: episodeRow.title ?? undefined,
            is_future: timeline.is_future,
          },
          id: `${animeRow.id}-${episodeRow.number}`,
          start: episodeRow.aired ?? new Date().toISOString(),
          title: buildCalendarEventTitle(animeRow.titleRomaji, episodeRow),
        } satisfies CalendarEvent;
      });
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
      cursor?: string;
      downloadId?: number;
      direction?: "next" | "prev";
      endDate?: string;
      eventType?: string;
      limit?: number;
      startDate?: string;
      status?: string;
    } = {}) {
      const limit = Math.max(1, Math.min(input.limit ?? 100, 1000));
      const cursorId = input.cursor && /^\d+$/.test(input.cursor)
        ? Number(input.cursor)
        : undefined;
      const baseConditions = [
        input.animeId ? eq(downloadEvents.animeId, input.animeId) : undefined,
        input.downloadId
          ? eq(downloadEvents.downloadId, input.downloadId)
          : undefined,
        input.endDate
          ? lte(downloadEvents.createdAt, input.endDate)
          : undefined,
        input.eventType
          ? eq(downloadEvents.eventType, input.eventType)
          : undefined,
        input.startDate
          ? gte(downloadEvents.createdAt, input.startDate)
          : undefined,
        input.status
          ? or(
            eq(downloadEvents.fromStatus, input.status),
            eq(downloadEvents.toStatus, input.status),
          )
          : undefined,
      ].filter((value): value is Exclude<typeof value, undefined> =>
        value !== undefined
      );
      const cursorCondition = cursorId
        ? input.direction === "prev"
          ? gt(downloadEvents.id, cursorId)
          : lt(downloadEvents.id, cursorId)
        : undefined;
      const conditions = cursorCondition
        ? [...baseConditions, cursorCondition]
        : baseConditions;
      const query = db.select().from(downloadEvents).orderBy(
        input.direction === "prev"
          ? asc(downloadEvents.id)
          : desc(downloadEvents.id),
      ).limit(limit + 1);
      const rows = yield* tryDatabasePromise(
        "Failed to load download events",
        () => conditions.length > 0 ? query.where(and(...conditions)) : query,
      );
      const totalRows = yield* tryDatabasePromise(
        "Failed to count download events",
        () => {
          const totalQuery = db.select({ count: sql<number>`count(*)` }).from(
            downloadEvents,
          );
          return baseConditions.length > 0
            ? totalQuery.where(and(...baseConditions))
            : totalQuery;
        },
      );
      const hasExtraRow = rows.length > limit;
      const pageRows = hasExtraRow ? rows.slice(0, limit) : rows;
      const orderedRows = input.direction === "prev"
        ? [...pageRows].reverse()
        : pageRows;
      const contexts = yield* tryDatabasePromise(
        "Failed to load download events",
        () => loadDownloadEventPresentationContexts(db, orderedRows),
      );
      const events = orderedRows.map((row) =>
        toDownloadEvent(row, contexts.get(row.id))
      ) as DownloadEvent[];
      const total = Number(totalRows[0]?.count ?? 0);
      const firstRowId = orderedRows[0]?.id;
      const lastRowId = orderedRows[orderedRows.length - 1]?.id;
      const newerExists = firstRowId
        ? yield* hasAdjacentDownloadEvent(
          db,
          baseConditions,
          gt(downloadEvents.id, firstRowId),
        )
        : false;
      const olderExists = lastRowId
        ? yield* hasAdjacentDownloadEvent(
          db,
          baseConditions,
          lt(downloadEvents.id, lastRowId),
        )
        : false;

      return {
        events,
        has_more: olderExists,
        limit,
        next_cursor: olderExists && lastRowId ? String(lastRowId) : undefined,
        prev_cursor: newerExists && firstRowId ? String(firstRowId) : undefined,
        total,
      } satisfies DownloadEventsPage;
    },
  );

  const exportDownloadEvents = Effect.fn(
    "OperationsService.exportDownloadEvents",
  )(
    function* (input: {
      animeId?: number;
      downloadId?: number;
      endDate?: string;
      eventType?: string;
      limit?: number;
      order?: "asc" | "desc";
      startDate?: string;
      status?: string;
    } = {}) {
      const limit = Math.max(1, Math.min(input.limit ?? 10_000, 50_000));
      const order = input.order === "asc" ? "asc" : "desc";
      const baseConditions = [
        input.animeId ? eq(downloadEvents.animeId, input.animeId) : undefined,
        input.downloadId
          ? eq(downloadEvents.downloadId, input.downloadId)
          : undefined,
        input.endDate
          ? lte(downloadEvents.createdAt, input.endDate)
          : undefined,
        input.eventType
          ? eq(downloadEvents.eventType, input.eventType)
          : undefined,
        input.startDate
          ? gte(downloadEvents.createdAt, input.startDate)
          : undefined,
        input.status
          ? or(
            eq(downloadEvents.fromStatus, input.status),
            eq(downloadEvents.toStatus, input.status),
          )
          : undefined,
      ].filter((value): value is Exclude<typeof value, undefined> =>
        value !== undefined
      );

      const query = db.select().from(downloadEvents).orderBy(
        order === "asc" ? asc(downloadEvents.id) : desc(downloadEvents.id),
      ).limit(limit + 1);
      const rows = yield* tryDatabasePromise(
        "Failed to export download events",
        () =>
          baseConditions.length > 0
            ? query.where(and(...baseConditions))
            : query,
      );
      const totalRows = yield* tryDatabasePromise(
        "Failed to count download events",
        () => {
          const totalQuery = db.select({ count: sql<number>`count(*)` }).from(
            downloadEvents,
          );
          return baseConditions.length > 0
            ? totalQuery.where(and(...baseConditions))
            : totalQuery;
        },
      );

      const truncated = rows.length > limit;
      const exportRows = truncated ? rows.slice(0, limit) : rows;
      const contexts = yield* tryDatabasePromise(
        "Failed to export download events",
        () => loadDownloadEventPresentationContexts(db, exportRows),
      );
      const events = exportRows.map((row) =>
        toDownloadEvent(row, contexts.get(row.id))
      ) as DownloadEvent[];
      const total = Number(totalRows[0]?.count ?? 0);

      return {
        events,
        total,
        exported: events.length,
        truncated,
        limit,
        order,
        generated_at: nowIso(),
      } satisfies DownloadEventsExport;
    },
  );

  const hasAdjacentDownloadEvent = Effect.fn(
    "OperationsService.hasAdjacentDownloadEvent",
  )(function* (
    db: AppDatabase,
    baseConditions: ReadonlyArray<Parameters<typeof and>[number]>,
    cursorCondition: Parameters<typeof and>[number],
  ) {
    const rows = yield* tryDatabasePromise(
      "Failed to load download events",
      () =>
        db.select({ id: downloadEvents.id }).from(downloadEvents).where(
          and(...baseConditions, cursorCondition),
        ).limit(1),
    );

    return rows.length > 0;
  });

  const listDownloadQueue = Effect.fn("OperationsService.listDownloadQueue")(
    function* () {
      const rows = yield* tryDatabasePromise(
        "Failed to list download queue",
        () =>
          db.select().from(downloads).where(
            inArray(downloads.status, ["queued", "downloading", "paused"]),
          ).orderBy(desc(downloads.id)),
      );
      const contexts = yield* tryDatabasePromise(
        "Failed to list download queue",
        () => loadDownloadPresentationContexts(db, rows),
      );
      return rows.map((row) =>
        toDownload(row, contexts.get(row.id))
      ) as Download[];
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
      const contexts = yield* tryDatabasePromise(
        "Failed to list download history",
        () => loadDownloadPresentationContexts(db, rows),
      );
      return rows.map((row) =>
        toDownload(row, contexts.get(row.id))
      ) as Download[];
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
      const contexts = yield* tryDatabasePromise(
        "Failed to build download progress snapshot",
        () => loadDownloadPresentationContexts(db, rows),
      );
      return rows.map((row) =>
        toDownloadStatus(row, () => randomHex(20), contexts.get(row.id))
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
            Stream.mapError(() =>
              new OperationsPathError({
                message:
                  `Anime library folder is inaccessible: ${animeRow.rootFolder}`,
              })
            ),
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
                      upsertEpisodeFilesAtomic(
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
              cause instanceof DatabaseError ||
                cause instanceof OperationsPathError
                ? Effect.fail(cause)
                : Effect.fail(dbError("Failed to run library scan")(cause)),
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
    exportDownloadEvents,
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

function isAllDayAiring(aired?: string | null) {
  return !aired?.includes("T");
}

function buildCalendarEventTitle(
  animeTitle: string,
  episodeRow: { number: number; title: string | null },
) {
  return episodeRow.title
    ? `${animeTitle} - Episode ${episodeRow.number}: ${episodeRow.title}`
    : `${animeTitle} - Episode ${episodeRow.number}`;
}
