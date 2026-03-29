import { assertEquals, it } from "@/test/vitest.ts";
import { Cause, Effect, Exit, Schema } from "effect";
import { ConfigCoreSchema } from "@/features/system/config-schema.ts";

import * as schema from "@/db/schema.ts";
import type { AppDatabase } from "@/db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "@/db/migrate.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  anime,
  backgroundJobs,
  downloads,
  episodes,
  rssFeeds,
  systemLogs,
  unmappedFolderMatches,
} from "@/db/schema.ts";
import { StoredUnmappedFolderCorruptError } from "@/features/system/errors.ts";
import { encodeConfigCore } from "@/features/system/config-codec.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";
import {
  insertSystemConfigRow,
  loadSystemConfigRow,
  upsertSystemConfigRow,
} from "@/features/system/repository/system-config-repository.ts";
import {
  countActiveDownloads,
  countAnimeRows,
  countCompletedDownloads,
  countDownloadedEpisodeRows,
  countEpisodeRows,
  countFailedDownloads,
  countImportedDownloads,
  countQueuedDownloads,
  countRssFeedRows,
  countUpToDateAnimeRows,
  loadSystemLogPage,
} from "@/features/system/repository/stats-repository.ts";
import {
  decodeUnmappedFolderMatchRow,
  listUnmappedFolderMatchRows,
  loadUnmappedFolderMatchRow,
  upsertUnmappedFolderMatchRows,
} from "@/features/system/repository/unmapped-repository.ts";

it.scoped("system repository config helpers insert and upsert config rows", () =>
  withTestDbEffect((db, databaseFile) =>
    Effect.gen(function* () {
      yield* insertSystemConfigRow(db, {
        id: 1,
        data: encodeConfigCore(makeDefaultConfig(databaseFile)),
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      const initial = yield* loadSystemConfigRow(db);
      assertEquals(initial?.id, 1);

      const updatedEncoded = yield* Schema.encode(ConfigCoreSchema)(
        makeDefaultConfig(databaseFile),
      );
      const updatedData = encodeConfigCore({
        ...updatedEncoded,
        library: { ...updatedEncoded.library, library_path: "/new-library" },
      });
      yield* upsertSystemConfigRow(db, {
        id: 1,
        data: updatedData,
        updatedAt: "2024-01-02T00:00:00.000Z",
      });

      const updated = yield* loadSystemConfigRow(db);
      assertEquals(updated?.updatedAt, "2024-01-02T00:00:00.000Z");
      assertEquals(updated?.data.includes("/new-library"), true);
    }),
  ),
);

it.scoped("system repository query helpers filter logs and count system state", () =>
  withTestDbEffect((db, _databaseFile) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db.insert(systemLogs).values([
          {
            eventType: "library.scan.started",
            level: "info",
            message: "scan start",
            details: null,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
          {
            eventType: "downloads.error",
            level: "error",
            message: "download failed",
            details: null,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
          {
            eventType: "rss.refresh",
            level: "info",
            message: "rss",
            details: null,
            createdAt: "2024-01-03T00:00:00.000Z",
          },
        ]),
      );
      yield* Effect.promise(() =>
        db.insert(anime).values({
          id: 20,
          malId: null,
          titleRomaji: "Naruto",
          titleEnglish: null,
          titleNative: null,
          format: "TV",
          description: null,
          score: null,
          genres: "[]",
          studios: "[]",
          coverImage: null,
          bannerImage: null,
          status: "RELEASING",
          episodeCount: 2,
          startDate: null,
          endDate: null,
          startYear: null,
          endYear: null,
          nextAiringAt: null,
          nextAiringEpisode: null,
          profileName: "Default",
          rootFolder: "/library/Naruto",
          addedAt: "2024-01-01T00:00:00.000Z",
          monitored: true,
          releaseProfileIds: "[]",
        }),
      );
      yield* Effect.promise(() =>
        db.insert(episodes).values([
          {
            animeId: 20,
            number: 1,
            title: null,
            aired: null,
            downloaded: true,
            filePath: "/library/Naruto/01.mkv",
          },
          {
            animeId: 20,
            number: 2,
            title: null,
            aired: null,
            downloaded: false,
            filePath: null,
          },
        ]),
      );
      yield* Effect.promise(() =>
        db.insert(downloads).values([
          {
            animeId: 20,
            animeTitle: "Naruto",
            episodeNumber: 1,
            isBatch: false,
            coveredEpisodes: null,
            torrentName: "Naruto - 01",
            status: "queued",
            progress: null,
            addedAt: "2024-01-01T00:00:00.000Z",
            downloadDate: null,
            groupName: null,
            magnet: null,
            infoHash: null,
            externalState: null,
            errorMessage: null,
            savePath: null,
            contentPath: null,
            totalBytes: null,
            downloadedBytes: null,
            speedBytes: null,
            etaSeconds: null,
            sourceMetadata: null,
            lastSyncedAt: null,
            retryCount: 0,
            lastErrorAt: null,
            reconciledAt: null,
          },
          {
            animeId: 20,
            animeTitle: "Naruto",
            episodeNumber: 2,
            isBatch: false,
            coveredEpisodes: null,
            torrentName: "Naruto - 02",
            status: "paused",
            progress: null,
            addedAt: "2024-01-01T00:00:00.000Z",
            downloadDate: null,
            groupName: null,
            magnet: null,
            infoHash: null,
            externalState: null,
            errorMessage: null,
            savePath: null,
            contentPath: null,
            totalBytes: null,
            downloadedBytes: null,
            speedBytes: null,
            etaSeconds: null,
            sourceMetadata: null,
            lastSyncedAt: null,
            retryCount: 0,
            lastErrorAt: null,
            reconciledAt: null,
          },
          {
            animeId: 20,
            animeTitle: "Naruto",
            episodeNumber: 3,
            isBatch: false,
            coveredEpisodes: null,
            torrentName: "Naruto - 03",
            status: "error",
            progress: null,
            addedAt: "2024-01-01T00:00:00.000Z",
            downloadDate: null,
            groupName: null,
            magnet: null,
            infoHash: null,
            externalState: null,
            errorMessage: null,
            savePath: null,
            contentPath: null,
            totalBytes: null,
            downloadedBytes: null,
            speedBytes: null,
            etaSeconds: null,
            sourceMetadata: null,
            lastSyncedAt: null,
            retryCount: 0,
            lastErrorAt: null,
            reconciledAt: null,
          },
          {
            animeId: 20,
            animeTitle: "Naruto",
            episodeNumber: 4,
            isBatch: false,
            coveredEpisodes: null,
            torrentName: "Naruto - 04",
            status: "completed",
            progress: null,
            addedAt: "2024-01-01T00:00:00.000Z",
            downloadDate: null,
            groupName: null,
            magnet: null,
            infoHash: null,
            externalState: null,
            errorMessage: null,
            savePath: null,
            contentPath: null,
            totalBytes: null,
            downloadedBytes: null,
            speedBytes: null,
            etaSeconds: null,
            sourceMetadata: null,
            lastSyncedAt: null,
            retryCount: 0,
            lastErrorAt: null,
            reconciledAt: null,
          },
          {
            animeId: 20,
            animeTitle: "Naruto",
            episodeNumber: 5,
            isBatch: false,
            coveredEpisodes: null,
            torrentName: "Naruto - 05",
            status: "imported",
            progress: null,
            addedAt: "2024-01-01T00:00:00.000Z",
            downloadDate: null,
            groupName: null,
            magnet: null,
            infoHash: null,
            externalState: null,
            errorMessage: null,
            savePath: null,
            contentPath: null,
            totalBytes: null,
            downloadedBytes: null,
            speedBytes: null,
            etaSeconds: null,
            sourceMetadata: null,
            lastSyncedAt: null,
            retryCount: 0,
            lastErrorAt: null,
            reconciledAt: null,
          },
        ]),
      );
      yield* Effect.promise(() =>
        db.insert(backgroundJobs).values([
          {
            name: "rss",
            isRunning: true,
            lastRunAt: null,
            lastSuccessAt: null,
            lastStatus: null,
            lastMessage: null,
            runCount: 0,
          },
          {
            name: "library_scan",
            isRunning: false,
            lastRunAt: null,
            lastSuccessAt: null,
            lastStatus: null,
            lastMessage: null,
            runCount: 0,
          },
        ]),
      );
      yield* Effect.promise(() =>
        db.insert(rssFeeds).values({
          animeId: 20,
          url: "https://example.com/rss.xml",
          name: null,
          lastChecked: null,
          enabled: true,
          createdAt: "2024-01-01T00:00:00.000Z",
        }),
      );

      const scanPage = yield* loadSystemLogPage(db, {
        eventType: "Scan",
        page: 1,
        pageSize: 10,
      });
      assertEquals(scanPage.total, 1);
      assertEquals(scanPage.rows[0].message, "scan start");

      const errorPage = yield* loadSystemLogPage(db, {
        level: "error",
        page: 1,
        pageSize: 10,
        startDate: "2024-01-02T00:00:00.000Z",
      });
      assertEquals(errorPage.total, 1);
      assertEquals(errorPage.rows[0].eventType, "downloads.error");

      assertEquals(yield* countQueuedDownloads(db), 1);
      assertEquals(yield* countActiveDownloads(db), 1);
      assertEquals(yield* countFailedDownloads(db), 1);
      assertEquals(yield* countCompletedDownloads(db), 1);
      assertEquals(yield* countImportedDownloads(db), 1);
      assertEquals(yield* countAnimeRows(db), 1);
      assertEquals(yield* countEpisodeRows(db), 2);
      assertEquals(yield* countDownloadedEpisodeRows(db), 1);
      assertEquals(yield* countRssFeedRows(db), 1);
    }),
  ),
);

it.scoped("countUpToDateAnimeRows counts monitored anime with complete downloads", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db.insert(anime).values([
          {
            addedAt: "2024-01-01T00:00:00.000Z",
            bannerImage: null,
            coverImage: null,
            description: null,
            endDate: null,
            endYear: null,
            episodeCount: 2,
            format: "TV",
            genres: "[]",
            id: 21,
            malId: null,
            monitored: true,
            nextAiringAt: null,
            nextAiringEpisode: null,
            profileName: "Default",
            recommendedAnime: null,
            releaseProfileIds: "[]",
            rootFolder: "/library/Full",
            score: null,
            startDate: null,
            startYear: null,
            status: "RELEASING",
            studios: "[]",
            synonyms: null,
            titleEnglish: null,
            titleNative: null,
            titleRomaji: "Full",
          },
          {
            addedAt: "2024-01-01T00:00:00.000Z",
            bannerImage: null,
            coverImage: null,
            description: null,
            endDate: null,
            endYear: null,
            episodeCount: 2,
            format: "TV",
            genres: "[]",
            id: 22,
            malId: null,
            monitored: false,
            nextAiringAt: null,
            nextAiringEpisode: null,
            profileName: "Default",
            recommendedAnime: null,
            releaseProfileIds: "[]",
            rootFolder: "/library/Partial",
            score: null,
            startDate: null,
            startYear: null,
            status: "RELEASING",
            studios: "[]",
            synonyms: null,
            titleEnglish: null,
            titleNative: null,
            titleRomaji: "Partial",
          },
        ]),
      );
      yield* Effect.promise(() =>
        db.insert(episodes).values([
          {
            animeId: 21,
            aired: null,
            audioChannels: null,
            audioCodec: null,
            downloaded: true,
            durationSeconds: null,
            filePath: "/library/Full/01.mkv",
            fileSize: null,
            groupName: null,
            number: 1,
            quality: null,
            resolution: null,
            title: null,
            videoCodec: null,
          },
          {
            animeId: 21,
            aired: null,
            audioChannels: null,
            audioCodec: null,
            downloaded: true,
            durationSeconds: null,
            filePath: "/library/Full/02.mkv",
            fileSize: null,
            groupName: null,
            number: 2,
            quality: null,
            resolution: null,
            title: null,
            videoCodec: null,
          },
          {
            animeId: 22,
            aired: null,
            audioChannels: null,
            audioCodec: null,
            downloaded: true,
            durationSeconds: null,
            filePath: "/library/Partial/01.mkv",
            fileSize: null,
            groupName: null,
            number: 1,
            quality: null,
            resolution: null,
            title: null,
            videoCodec: null,
          },
          {
            animeId: 22,
            aired: null,
            audioChannels: null,
            audioCodec: null,
            downloaded: false,
            durationSeconds: null,
            filePath: null,
            fileSize: null,
            groupName: null,
            number: 2,
            quality: null,
            resolution: null,
            title: null,
            videoCodec: null,
          },
          {
            animeId: 22,
            aired: null,
            audioChannels: null,
            audioCodec: null,
            downloaded: true,
            durationSeconds: null,
            filePath: "/library/Partial/03.mkv",
            fileSize: null,
            groupName: null,
            number: 3,
            quality: null,
            resolution: null,
            title: null,
            videoCodec: null,
          },
        ]),
      );

      assertEquals(yield* countUpToDateAnimeRows(db), 1);
    }),
  ),
);

it.scoped("unmapped folder match rows persist cached suggestions", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* upsertUnmappedFolderMatchRows(
        db,
        [
          {
            last_matched_at: "2024-01-01T00:00:00.000Z",
            match_status: "done",
            name: "Naruto Archive",
            path: "/library/Naruto Archive",
            size: 0,
            suggested_matches: [
              {
                already_in_library: true,
                id: 20,
                match_confidence: 0.97,
                match_reason:
                  'Matched a library title from the normalized folder name "Naruto Archive"',
                title: { romaji: "Naruto" },
              },
            ],
          },
        ],
        "2024-01-01T00:00:00.000Z",
      );

      const rows = yield* listUnmappedFolderMatchRows(db);
      assertEquals(rows.length, 1);
      assertEquals(rows[0]?.path, "/library/Naruto Archive");

      const decoded = yield* decodeUnmappedFolderMatchRow(rows[0]!);
      assertEquals(decoded.match_status, "done");
      assertEquals(decoded.search_queries, ["Naruto Archive"]);
      assertEquals(decoded.suggested_matches[0]?.id, 20);
      assertEquals(decoded.suggested_matches[0]?.match_confidence, 0.97);
    }),
  ),
);

it.scoped("decodeUnmappedFolderMatchRow fails for corrupt stored suggestions", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db.insert(unmappedFolderMatches).values({
          lastMatchedAt: null,
          lastMatchError: null,
          matchAttempts: 0,
          matchStatus: "pending",
          name: "Broken",
          path: "/library/Broken",
          size: 0,
          suggestedMatches: "not-json",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }),
      );

      const row = yield* loadUnmappedFolderMatchRow(db, "/library/Broken");
      const exit = yield* Effect.exit(decodeUnmappedFolderMatchRow(row!));

      assertEquals(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        const failure = Cause.failureOption(exit.cause);
        assertEquals(failure._tag, "Some");
        if (failure._tag === "Some") {
          assertEquals(failure.value instanceof StoredUnmappedFolderCorruptError, true);
        }
      }
    }),
  ),
);

it.scoped("loadUnmappedFolderMatchRow returns a row by folder path", () =>
  withTestDbEffect((db) =>
    Effect.gen(function* () {
      yield* upsertUnmappedFolderMatchRows(
        db,
        [
          {
            match_status: "paused",
            name: "Naruto Archive",
            path: "/library/Naruto Archive",
            size: 0,
            suggested_matches: [],
          },
        ],
        "2024-01-01T00:00:00.000Z",
      );

      const row = yield* loadUnmappedFolderMatchRow(db, "/library/Naruto Archive");

      assertEquals(row?.path, "/library/Naruto Archive");
      assertEquals(row?.matchStatus, "paused");
    }),
  ),
);

const withTestDbEffect = Effect.fn("SystemRepositoryTest.withTestDbEffect")(function* <A, E, R>(
  run: (db: AppDatabase, databaseFile: string) => Effect.Effect<A, E, R>,
) {
  return yield* withSqliteTestDbEffect({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db, databaseFile) => run(db as AppDatabase, databaseFile),
    schema,
  });
});
