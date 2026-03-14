import { and, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import type {
  Config,
  EpisodeSearchResult,
  ScannerState,
  ScanResult,
  SearchResults,
} from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import {
  anime,
  backgroundJobs,
  downloads,
  episodes,
  rssFeeds,
} from "../../db/schema.ts";
import type { AniListClient } from "../anime/anilist.ts";
import { inferAiredAt, upsertEpisode } from "../anime/repository.ts";
import { EventBus } from "../events/event-bus.ts";
import { type ParsedRelease, RssClient } from "./rss-client.ts";
import {
  analyzeScannedFile,
  findBestLocalAnimeMatch,
  scanVideoFiles,
  titlesMatch,
  toAnimeSearchCandidate,
} from "./library-import.ts";
import { suggestUnmappedFolders } from "./unmapped-folders.ts";
import {
  hasOverlappingDownload,
  inferCoveredEpisodeNumbers,
  parseCoveredEpisodes,
  toCoveredEpisodesJson,
} from "./download-lifecycle.ts";
import {
  appendLog,
  loadMissingEpisodeNumbers,
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
  nowIso,
  recordDownloadEvent,
} from "./job-support.ts";
import {
  getConfigLibraryPath,
  loadCurrentEpisodeState,
  loadQualityProfile,
  loadReleaseRules,
  loadRuntimeConfig,
  requireAnime,
} from "./repository.ts";
import {
  fallbackReleases,
  mapSearchCategory,
  mapSearchFilter,
  toNyaaSearchResult,
} from "./search-support.ts";
import {
  compareEpisodeSearchResults,
  decideDownloadAction,
  parseEpisodeFromTitle,
  parseReleaseName,
} from "./release-ranking.ts";
import { parseEpisodeNumber } from "./file-scanner.ts";
import { type OperationsError } from "./errors.ts";
import type {
  TryDatabasePromise,
  TryOperationsPromise,
} from "./service-support.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import {
  type FileSystemShape,
  isWithinPathRoot,
  sanitizePathSegment,
} from "../../lib/filesystem.ts";
import { OperationsInputError } from "./errors.ts";

export function makeSearchOrchestration(input: {
  db: AppDatabase;
  fs: FileSystemShape;
  aniList: typeof AniListClient.Service;
  rssClient: typeof RssClient.Service;
  qbitClient: typeof QBitTorrentClient.Service;
  eventBus: typeof EventBus.Service;
  tryDatabasePromise: TryDatabasePromise;
  tryOperationsPromise: TryOperationsPromise;
  wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => OperationsError | DatabaseError;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  maybeQBitConfig: (config: Config) => QBitConfig | null;
  publishDownloadProgress: () => Effect.Effect<void, DatabaseError>;
  publishRssCheckProgress: (input: {
    current: number;
    total: number;
    feed_name: string;
  }) => Effect.Effect<void>;
}) {
  const {
    db,
    fs,
    aniList,
    rssClient,
    qbitClient,
    eventBus,
    tryDatabasePromise,
    tryOperationsPromise,
    wrapOperationsError,
    dbError,
    maybeQBitConfig,
    publishDownloadProgress,
    publishRssCheckProgress,
  } = input;

  const searchNyaaReleases = Effect.fn("OperationsService.searchNyaaReleases")(
    function* (
      query: string,
      animeRow: typeof anime.$inferSelect | null,
      config: Config,
      category?: string,
      filter?: string,
    ) {
      const resolvedCategory = mapSearchCategory(
        category,
        config.nyaa.default_category || "1_2",
      );
      const resolvedFilter = mapSearchFilter(
        filter,
        config.nyaa.filter_remakes ? "1" : "0",
      );
      const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=${
        encodeURIComponent(resolvedCategory)
      }&f=${encodeURIComponent(resolvedFilter)}`;
      const results = [...yield* rssClient.fetchItems(url)];

      if (results.length > 0) {
        return results;
      }

      return fallbackReleases(query, animeRow?.titleRomaji);
    },
  );

  const searchEpisodeReleases = Effect.fn(
    "OperationsService.searchEpisodeReleases",
  )(function* (
    animeRow: typeof anime.$inferSelect,
    episodeNumber: number,
    config: Config,
  ) {
    const queries = [
      `${animeRow.titleRomaji} ${String(episodeNumber).padStart(2, "0")}`,
      `${animeRow.titleRomaji} ${episodeNumber}`,
      animeRow.titleEnglish
        ? `${animeRow.titleEnglish} ${String(episodeNumber).padStart(2, "0")}`
        : null,
    ].filter((value): value is string => Boolean(value));

    const results: ParsedRelease[] = [];

    for (const query of queries) {
      const items = yield* searchNyaaReleases(query, animeRow, config);

      for (const item of items) {
        const parsedRelease = parseReleaseName(item.title);

        if (
          parsedRelease.episodeNumbers.length > 0 &&
          !parsedRelease.episodeNumbers.includes(episodeNumber) &&
          !parsedRelease.isBatch
        ) {
          continue;
        }

        if (!results.some((existing) => existing.infoHash === item.infoHash)) {
          results.push(item);
        }
      }

      if (results.length >= 10) {
        break;
      }
    }

    if (results.length === 0) {
      return fallbackReleases(
        `${animeRow.titleRomaji} ${episodeNumber}`,
        animeRow.titleRomaji,
      );
    }

    return results.slice(0, 10);
  });

  const searchReleasesRaw = Effect.fn("OperationsService.searchReleases")(
    function* (
      query: string,
      animeId?: number,
      category?: string,
      filter?: string,
    ) {
      const animeRow = animeId
        ? yield* tryOperationsPromise(
          "Failed to search releases",
          () => requireAnime(db, animeId),
        )
        : null;
      const searchQuery = (query || animeRow?.titleRomaji || "Search").trim();
      const runtimeConfig = yield* tryOperationsPromise(
        "Failed to search releases",
        () => loadRuntimeConfig(db),
      );
      const results = yield* searchNyaaReleases(
        searchQuery,
        animeRow,
        runtimeConfig,
        category,
        filter,
      ).pipe(Effect.mapError(wrapOperationsError("Failed to search releases")));

      return {
        results: results.map(toNyaaSearchResult),
        seadex_groups: results.filter((item) => item.isSeaDex).map((item) =>
          item.group
        )
          .filter((value): value is string => Boolean(value)),
      } satisfies SearchResults;
    },
  );

  const searchReleases = (
    query: string,
    animeId?: number,
    category?: string,
    filter?: string,
  ) =>
    searchReleasesRaw(query, animeId, category, filter).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError
          ? error
          : dbError("Failed to search releases")(error)
      ),
    );

  const searchEpisode = Effect.fn("OperationsService.searchEpisode")(function* (
    animeId: number,
    episodeNumber: number,
  ) {
    const animeRow = yield* tryOperationsPromise(
      "Failed to search episode releases",
      () => requireAnime(db, animeId),
    );
    const runtimeConfig = yield* tryOperationsPromise(
      "Failed to search episode releases",
      () => loadRuntimeConfig(db),
    );
    const profile = yield* tryDatabasePromise(
      "Failed to search episode releases",
      () => loadQualityProfile(db, animeRow.profileName),
    );
    const rules = yield* tryDatabasePromise(
      "Failed to search episode releases",
      () => loadReleaseRules(db, animeRow),
    );
    const currentEpisode = yield* tryDatabasePromise(
      "Failed to search episode releases",
      () => loadCurrentEpisodeState(db, animeId, episodeNumber),
    );
    const results = yield* searchEpisodeReleases(
      animeRow,
      episodeNumber,
      runtimeConfig,
    ).pipe(
      Effect.mapError(wrapOperationsError("Failed to search episode releases")),
    );

    return results.map((item) => ({
      download_action: decideDownloadAction(
        profile,
        rules,
        currentEpisode,
        item,
        runtimeConfig,
      ),
      group: item.group,
      indexer: "Nyaa",
      info_hash: item.infoHash,
      leechers: item.leechers,
      link: item.magnet,
      publish_date: item.pubDate,
      quality: parseReleaseName(item.title).quality.name,
      seeders: item.seeders,
      size: item.sizeBytes,
      title: item.title,
    })).sort(compareEpisodeSearchResults) as EpisodeSearchResult[];
  });

  const triggerSearchMissingRaw = Effect.fn(
    "OperationsService.triggerSearchMissing",
  )(function* (animeId?: number) {
    return yield* Effect.gen(function* () {
      const title = animeId
        ? (yield* tryOperationsPromise(
          "Failed to queue missing-episode search",
          () => requireAnime(db, animeId),
        )).titleRomaji
        : "all anime";

      yield* eventBus.publish({
        type: "SearchMissingStarted",
        payload: { anime_id: animeId ?? 0, title },
      });

      const filter = animeId ? eq(episodes.animeId, animeId) : undefined;
      const missingRows = yield* tryDatabasePromise(
        "Failed to queue missing-episode search",
        () =>
          db.select().from(episodes).innerJoin(
            anime,
            eq(anime.id, episodes.animeId),
          )
            .where(
              filter
                ? and(
                  eq(episodes.downloaded, false),
                  sql`${episodes.aired} is not null`,
                  sql`${episodes.aired} <= ${nowIso()}`,
                  filter,
                )
                : and(
                  eq(episodes.downloaded, false),
                  sql`${episodes.aired} is not null`,
                  sql`${episodes.aired} <= ${nowIso()}`,
                ),
            ),
      );
      const runtimeConfig = yield* tryOperationsPromise(
        "Failed to queue missing-episode search",
        () => loadRuntimeConfig(db),
      );
      let queued = 0;

      for (const row of missingRows.slice(0, 10)) {
        const profile = yield* tryDatabasePromise(
          "Failed to queue missing-episode search",
          () => loadQualityProfile(db, row.anime.profileName),
        );
        const rules = yield* tryDatabasePromise(
          "Failed to queue missing-episode search",
          () => loadReleaseRules(db, row.anime),
        );
        const currentEpisode = yield* tryDatabasePromise(
          "Failed to queue missing-episode search",
          () => loadCurrentEpisodeState(db, row.anime.id, row.episodes.number),
        );
        const candidates = yield* searchEpisodeReleases(
          row.anime,
          row.episodes.number,
          runtimeConfig,
        );
        const best = candidates
          .map((item) => ({
            action: decideDownloadAction(
              profile,
              rules,
              currentEpisode,
              item,
              runtimeConfig,
            ),
            item,
          }))
          .find((entry) => entry.action.Accept || entry.action.Upgrade);

        if (!best) {
          continue;
        }

        const qbitConfig = maybeQBitConfig(runtimeConfig);
        const parsedRelease = parseReleaseName(best.item.title);
        const coveredEpisodes = toCoveredEpisodesJson(
          inferCoveredEpisodeNumbers({
            explicitEpisodes: parsedRelease.episodeNumbers,
            isBatch: parsedRelease.isBatch,
            missingEpisodes: missingRows
              .filter((entry) => entry.anime.id === row.anime.id)
              .map((entry) => entry.episodes.number),
            requestedEpisode: row.episodes.number,
          }),
        );

        if (
          yield* tryDatabasePromise(
            "Failed to queue missing-episode search",
            () =>
              hasOverlappingDownload(
                db,
                row.anime.id,
                best.item.infoHash,
                parseCoveredEpisodes(coveredEpisodes),
              ),
          )
        ) {
          continue;
        }

        const insertResult = yield* Effect.either(tryDatabasePromise(
          "Failed to queue missing-episode search",
          () =>
            db.insert(downloads).values({
              addedAt: nowIso(),
              animeId: row.anime.id,
              animeTitle: row.anime.titleRomaji,
              contentPath: null,
              coveredEpisodes,
              downloadDate: null,
              episodeNumber: row.episodes.number,
              groupName: best.item.group ?? null,
              infoHash: best.item.infoHash,
              isBatch: parsedRelease.isBatch,
              magnet: best.item.magnet,
              progress: 0,
              savePath: null,
              speedBytes: 0,
              status: "queued",
              totalBytes: best.item.sizeBytes,
              torrentName: best.item.title,
              downloadedBytes: 0,
              errorMessage: null,
              etaSeconds: null,
              externalState: "queued",
              lastSyncedAt: nowIso(),
            }).returning({ id: downloads.id }),
        ));

        if (insertResult._tag === "Left") {
          const dbError = insertResult.left;
          if (
            dbError instanceof DatabaseError && dbError.isUniqueConstraint()
          ) {
            continue;
          }
          return yield* dbError;
        }

        const insertedId = insertResult.right[0].id;
        let status = "queued";

        if (qbitConfig) {
          const qbitResult = yield* Effect.either(
            qbitClient.addTorrentUrl(qbitConfig, best.item.magnet),
          );

          if (qbitResult._tag === "Left") {
            yield* tryDatabasePromise(
              "Cleanup failed download",
              () => db.delete(downloads).where(eq(downloads.id, insertedId)),
            );
            return yield* wrapOperationsError(
              "Failed to queue missing-episode search",
            )(qbitResult.left);
          }

          status = "downloading";
          yield* tryDatabasePromise(
            "Update download status",
            () =>
              db.update(downloads).set({ status, externalState: status }).where(
                eq(downloads.id, insertedId),
              ),
          );
        }

        yield* tryDatabasePromise(
          "Failed to record download event",
          () =>
            recordDownloadEvent(db, {
              animeId: row.anime.id,
              downloadId: insertedId,
              eventType: "download.search_missing.queued",
              message: `Queued ${best.item.title}`,
              metadata: coveredEpisodes,
              toStatus: status,
            }),
        );
        queued += 1;
      }

      yield* eventBus.publish({
        type: "SearchMissingFinished",
        payload: { anime_id: animeId ?? 0, title, count: queued },
      });
      yield* publishDownloadProgress();
    }).pipe(Effect.withSpan("operations.search.missing"));
  });

  const triggerSearchMissing = (animeId?: number) =>
    triggerSearchMissingRaw(animeId).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError
          ? error
          : dbError("Failed to queue missing-episode search")(error)
      ),
    );

  const runRssCheckRaw = Effect.fn("OperationsService.runRssCheck")(
    function* () {
      yield* tryDatabasePromise(
        "Failed to run RSS check",
        () => markJobStarted(db, "rss"),
      );

      return yield* Effect.gen(function* () {
        const feeds = yield* tryDatabasePromise(
          "Failed to run RSS check",
          () => db.select().from(rssFeeds).where(eq(rssFeeds.enabled, true)),
        );
        const runtimeConfig = yield* tryOperationsPromise(
          "Failed to run RSS check",
          () => loadRuntimeConfig(db),
        );
        let newItems = 0;

        yield* eventBus.publish({ type: "RssCheckStarted" });

        for (const [index, feed] of feeds.entries()) {
          yield* publishRssCheckProgress({
            current: index + 1,
            total: feeds.length,
            feed_name: feed.name ?? feed.url,
          });

          newItems += yield* Effect.gen(function* () {
            const items = yield* rssClient.fetchItems(feed.url);
            const animeRow = yield* tryOperationsPromise(
              "Failed to run RSS check",
              () => requireAnime(db, feed.animeId),
            );
            const profile = yield* tryDatabasePromise(
              "Failed to run RSS check",
              () => loadQualityProfile(db, animeRow.profileName),
            );
            const rules = yield* tryDatabasePromise(
              "Failed to run RSS check",
              () => loadReleaseRules(db, animeRow),
            );
            let queuedForFeed = 0;

            for (const item of items.slice(0, 10)) {
              const exists = yield* tryDatabasePromise(
                "Failed to run RSS check",
                () =>
                  db.select({ id: downloads.id }).from(downloads).where(
                    sql`${downloads.infoHash} = ${item.infoHash}`,
                  ).limit(1),
              );

              if (exists[0]) {
                continue;
              }

              const episodeNumber = parseEpisodeFromTitle(item.title) ?? 1;
              const currentEpisode = yield* tryDatabasePromise(
                "Failed to run RSS check",
                () => loadCurrentEpisodeState(db, animeRow.id, episodeNumber),
              );
              const action = decideDownloadAction(
                profile,
                rules,
                currentEpisode,
                item,
                runtimeConfig,
              );

              if (!(action.Accept || action.Upgrade)) {
                continue;
              }

              const qbitConfig = maybeQBitConfig(runtimeConfig);
              const parsedRelease = parseReleaseName(item.title);
              const missingEpisodes = yield* tryDatabasePromise(
                "Failed to run RSS check",
                () => loadMissingEpisodeNumbers(db, animeRow.id),
              );
              const coveredEpisodes = toCoveredEpisodesJson(
                inferCoveredEpisodeNumbers({
                  explicitEpisodes: parsedRelease.episodeNumbers,
                  isBatch: parsedRelease.isBatch,
                  missingEpisodes,
                  requestedEpisode: episodeNumber,
                }),
              );

              if (
                yield* tryDatabasePromise(
                  "Failed to run RSS check",
                  () =>
                    hasOverlappingDownload(
                      db,
                      animeRow.id,
                      item.infoHash,
                      parseCoveredEpisodes(coveredEpisodes),
                    ),
                )
              ) {
                continue;
              }

              const insertResult = yield* Effect.either(tryDatabasePromise(
                "Failed to run RSS check",
                () =>
                  db.insert(downloads).values({
                    addedAt: nowIso(),
                    animeId: animeRow.id,
                    animeTitle: animeRow.titleRomaji,
                    contentPath: null,
                    coveredEpisodes,
                    downloadDate: null,
                    episodeNumber,
                    isBatch: parsedRelease.isBatch,
                    downloadedBytes: 0,
                    errorMessage: null,
                    etaSeconds: null,
                    externalState: "queued",
                    groupName: item.group ?? null,
                    infoHash: item.infoHash,
                    lastSyncedAt: nowIso(),
                    magnet: item.magnet,
                    progress: 0,
                    savePath: null,
                    speedBytes: 0,
                    status: "queued",
                    totalBytes: item.sizeBytes,
                    torrentName: item.title,
                  }).returning({ id: downloads.id }),
              ));

              if (insertResult._tag === "Left") {
                const dbError = insertResult.left;
                if (
                  dbError instanceof DatabaseError &&
                  dbError.isUniqueConstraint()
                ) {
                  continue;
                }
                return yield* dbError;
              }

              const insertedId = insertResult.right[0].id;
              let status = "queued";

              if (qbitConfig) {
                const qbitResult = yield* Effect.either(
                  qbitClient.addTorrentUrl(qbitConfig, item.magnet),
                );

                if (qbitResult._tag === "Left") {
                  yield* tryDatabasePromise(
                    "Cleanup failed download",
                    () =>
                      db.delete(downloads).where(eq(downloads.id, insertedId)),
                  );
                  return yield* wrapOperationsError("Failed to run RSS check")(
                    qbitResult.left,
                  );
                }

                status = "downloading";
                yield* tryDatabasePromise(
                  "Update download status",
                  () =>
                    db.update(downloads).set({ status, externalState: status })
                      .where(eq(downloads.id, insertedId)),
                );
              }

              yield* tryDatabasePromise(
                "Failed to run RSS check",
                () =>
                  recordDownloadEvent(db, {
                    animeId: animeRow.id,
                    downloadId: insertedId,
                    eventType: "download.rss.queued",
                    message: `Queued ${item.title} from RSS`,
                    metadata: coveredEpisodes,
                    toStatus: status,
                  }),
              );
              queuedForFeed += 1;
            }

            yield* tryDatabasePromise(
              "Failed to run RSS check",
              () =>
                db.update(rssFeeds).set({ lastChecked: nowIso() }).where(
                  eq(rssFeeds.id, feed.id),
                ),
            );

            return queuedForFeed;
          }).pipe(Effect.withSpan("operations.rss.feed"));
        }

        yield* tryDatabasePromise(
          "Failed to run RSS check",
          () => markJobSucceeded(db, "rss", `Queued ${newItems} release(s)`),
        );
        yield* eventBus.publish({
          type: "RssCheckFinished",
          payload: { new_items: newItems, total_feeds: feeds.length },
        });
        yield* publishDownloadProgress();

        return { newItems };
      }).pipe(
        Effect.withSpan("operations.rss.check"),
        Effect.catchAll((cause) =>
          tryDatabasePromise(
            "Failed to run RSS check",
            () => markJobFailed(db, "rss", cause),
          ).pipe(
            Effect.zipRight(
              Effect.fail(dbError("Failed to run RSS check")(cause)),
            ),
          )
        ),
      );
    },
  );

  const runRssCheck = () =>
    runRssCheckRaw().pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError
          ? error
          : dbError("Failed to run RSS check")(error)
      ),
    );

  const getUnmappedFolders = Effect.fn("OperationsService.getUnmappedFolders")(
    function* () {
      const root = yield* tryDatabasePromise(
        "Failed to scan unmapped folders",
        () => getConfigLibraryPath(db),
      );
      const animeRows = yield* tryDatabasePromise(
        "Failed to scan unmapped folders",
        () => db.select().from(anime),
      );
      const mappedRoots = new Set(animeRows.map((row) => row.rootFolder));
      const [job] = yield* tryDatabasePromise(
        "Failed to scan unmapped folders",
        () =>
          db.select().from(backgroundJobs).where(
            eq(backgroundJobs.name, "unmapped_scan"),
          )
            .limit(1),
      );
      const entries = yield* fs.readDir(root).pipe(
        Effect.mapError((error) =>
          new DatabaseError({
            cause: error,
            message: "Failed to scan unmapped folders",
          })
        ),
      );
      const folders = yield* suggestUnmappedFolders(
        entries.flatMap((entry) => {
          if (!entry.isDirectory) {
            return [];
          }

          const fullPath = `${root.replace(/\/$/, "")}/${entry.name}`;

          if (mappedRoots.has(fullPath)) {
            return [];
          }

          return [{ name: entry.name, path: fullPath }];
        }),
        aniList.searchAnimeMetadata,
      );

      return {
        folders,
        is_scanning: job?.isRunning ?? false,
        last_updated: job?.lastRunAt ?? nowIso(),
      } satisfies ScannerState;
    },
  );

  const runUnmappedScan = Effect.fn("OperationsService.runUnmappedScan")(
    function* () {
      yield* tryDatabasePromise(
        "Failed to scan unmapped folders",
        () => markJobStarted(db, "unmapped_scan"),
      );

      return yield* Effect.gen(function* () {
        const root = yield* tryDatabasePromise(
          "Failed to scan unmapped folders",
          () => getConfigLibraryPath(db),
        );
        const animeRows = yield* tryDatabasePromise(
          "Failed to scan unmapped folders",
          () => db.select().from(anime),
        );
        const mappedRoots = new Set(animeRows.map((row) => row.rootFolder));
        const entries = yield* fs.readDir(root).pipe(
          Effect.mapError((error) =>
            new DatabaseError({
              cause: error,
              message: "Failed to scan unmapped folders",
            })
          ),
        );
        const folderCount = entries.reduce((count, entry) => {
          if (!entry.isDirectory) {
            return count;
          }

          const fullPath = `${root.replace(/\/$/, "")}/${entry.name}`;
          return mappedRoots.has(fullPath) ? count : count + 1;
        }, 0);

        yield* tryDatabasePromise(
          "Failed to scan unmapped folders",
          () =>
            markJobSucceeded(
              db,
              "unmapped_scan",
              `Found ${folderCount} unmapped folder(s)`,
            ),
        );
        yield* tryDatabasePromise(
          "Failed to scan unmapped folders",
          () =>
            appendLog(
              db,
              "library.unmapped.scan",
              "info",
              `Scanned unmapped folders: ${folderCount}`,
            ),
        );

        return { folderCount };
      }).pipe(
        Effect.catchAll((cause) =>
          tryDatabasePromise(
            "Failed to scan unmapped folders",
            () => markJobFailed(db, "unmapped_scan", cause),
          ).pipe(
            Effect.zipRight(
              Effect.fail(dbError("Failed to scan unmapped folders")(cause)),
            ),
          )
        ),
      );
    },
  );

  const importUnmappedFolder = Effect.fn(
    "OperationsService.importUnmappedFolder",
  )(function* (
    input: { folder_name: string; anime_id: number; profile_name?: string },
  ) {
    const animeRow = yield* tryOperationsPromise(
      "Failed to import unmapped folder",
      () => requireAnime(db, input.anime_id),
    );
    const libraryPath = yield* tryDatabasePromise(
      "Failed to import unmapped folder",
      () => getConfigLibraryPath(db),
    );
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
    const files = yield* scanVideoFiles(fs, folderPath).pipe(
      Effect.mapError((error) =>
        new DatabaseError({
          cause: error,
          message: "Failed to import unmapped folder",
        })
      ),
    );

    yield* tryDatabasePromise(
      "Failed to import unmapped folder",
      () =>
        db.update(anime).set({ rootFolder: folderPath }).where(
          eq(anime.id, input.anime_id),
        ),
    );

    if (animeRow.rootFolder !== folderPath) {
      const previousEntries = yield* fs.readDir(animeRow.rootFolder).pipe(
        Effect.catchAll(() => Effect.succeed<Deno.DirEntry[]>([])),
      );

      if (previousEntries.length === 0) {
        yield* fs.remove(animeRow.rootFolder, { recursive: true }).pipe(
          Effect.catchAll(() => Effect.void),
        );
      }
    }

    let imported = 0;

    for (const file of files) {
      const episodeNumber = parseEpisodeNumber(file.path);

      if (!episodeNumber) {
        continue;
      }

      yield* tryDatabasePromise(
        "Failed to import unmapped folder",
        () =>
          upsertEpisode(db, input.anime_id, episodeNumber, {
            aired: inferAiredAt(
              animeRow.status,
              episodeNumber,
              animeRow.episodeCount ?? undefined,
              animeRow.startDate ?? undefined,
              animeRow.endDate ?? undefined,
            ),
            downloaded: true,
            filePath: file.path,
            title: null,
          }),
      );
      imported += 1;
    }

    yield* tryDatabasePromise(
      "Failed to import unmapped folder",
      () =>
        appendLog(
          db,
          "library.unmapped.imported",
          "success",
          `Mapped ${folderName} to anime ${input.anime_id} and imported ${imported} episode(s)`,
        ),
    );
  });
  const scanImportPathRaw = Effect.fn("OperationsService.scanImportPath")(
    function* (path: string, animeId?: number) {
      const files = [...yield* scanVideoFiles(fs, path)].sort((a, b) =>
        a.path.localeCompare(b.path)
      );
      const animeRows = animeId
        ? [
          yield* tryOperationsPromise("Failed to scan import path", () =>
            requireAnime(db, animeId)),
        ]
        : yield* tryDatabasePromise(
          "Failed to scan import path",
          () => db.select().from(anime),
        );
      const analyzedFiles = files.map((file) => analyzeScannedFile(file));
      const candidateMap = new Map<
        number,
        ReturnType<typeof toAnimeSearchCandidate>
      >();

      if (animeId) {
        const row = animeRows[0];
        candidateMap.set(row.id, toAnimeSearchCandidate(row));
      } else {
        const parsedTitles = [
          ...new Set(
            analyzedFiles.map((file) => file.parsed_title).filter((value) =>
              value.length > 0
            ),
          ),
        ].slice(0, 8);

        for (const parsedTitle of parsedTitles) {
          const remoteCandidates = yield* aniList.searchAnimeMetadata(
            parsedTitle,
          );

          for (const candidate of remoteCandidates.slice(0, 5)) {
            candidateMap.set(candidate.id, candidate);
          }
        }
      }

      for (const row of animeRows) {
        candidateMap.set(row.id, toAnimeSearchCandidate(row));
      }

      return {
        candidates: [...candidateMap.values()],
        files: analyzedFiles.map((file) => {
          const localMatch = animeId
            ? animeRows[0]
            : findBestLocalAnimeMatch(file.parsed_title, animeRows);
          const remoteCandidate = !animeId && !localMatch
            ? [...candidateMap.values()].find((candidate) =>
              titlesMatch(file.parsed_title, candidate)
            )
            : undefined;

          return {
            episode_number: file.episode_number,
            filename: file.filename,
            group: file.group,
            matched_anime: localMatch
              ? { id: localMatch.id, title: localMatch.titleRomaji }
              : undefined,
            parsed_title: file.parsed_title,
            resolution: file.resolution,
            season: file.season,
            source_path: file.source_path,
            suggested_candidate_id: localMatch?.id ?? remoteCandidate?.id,
          };
        }),
        skipped: [],
      } satisfies ScanResult;
    },
  );

  const scanImportPath = (path: string, animeId?: number) =>
    scanImportPathRaw(path, animeId).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError
          ? error
          : dbError("Failed to scan import path")(error)
      ),
    );

  return {
    getUnmappedFolders,
    importUnmappedFolder,
    runRssCheck,
    runUnmappedScan,
    scanImportPath,
    searchEpisode,
    searchEpisodeReleases,
    searchNyaaReleases,
    searchReleases,
    triggerSearchMissing,
  };
}
