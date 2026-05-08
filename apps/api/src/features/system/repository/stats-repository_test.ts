import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import * as schema from "@/db/schema.ts";
import { anime, episodes, downloads, rssFeeds } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  countAnimeRows,
  countMonitoredAnimeRows,
  countEpisodeRows,
  countDownloadedEpisodeRows,
  countRssFeedRows,
  countQueuedDownloads,
  countActiveDownloads,
  countCompletedDownloads,
  loadSystemLibraryStatsAggregate,
  loadSystemDownloadStatsAggregate,
  listBackgroundJobRows,
  listRecentSystemLogRows,
  loadSystemLogPage,
} from "@/features/system/repository/stats-repository.ts";

it.scoped("countAnimeRows returns 0 for empty table", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const count = yield* countAnimeRows(db);
        assert.deepStrictEqual(count, 0);
      }),
    schema,
  }),
);

it.scoped("countAnimeRows counts inserted rows", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db.insert(anime).values([
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              episodeCount: 12,
              format: "TV",
              genres: "[]",
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: "/lib/1",
              status: "FINISHED",
              studios: "[]",
              titleRomaji: "A",
            },
            {
              addedAt: "2025-01-02T00:00:00.000Z",
              episodeCount: 24,
              format: "TV",
              genres: "[]",
              monitored: false,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: "/lib/2",
              status: "RELEASING",
              studios: "[]",
              titleRomaji: "B",
            },
          ]),
        );
        assert.deepStrictEqual(yield* countAnimeRows(db), 2);
        assert.deepStrictEqual(yield* countMonitoredAnimeRows(db), 1);
      }),
    schema,
  }),
);

it.scoped("countEpisodeRows and countDownloadedEpisodeRows count correctly", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db.insert(anime).values({
            addedAt: "2025-01-01T00:00:00.000Z",
            episodeCount: 12,
            format: "TV",
            genres: "[]",
            monitored: true,
            profileName: "Default",
            releaseProfileIds: "[]",
            rootFolder: "/lib/A",
            status: "FINISHED",
            studios: "[]",
            titleRomaji: "A",
          }),
        );
        yield* Effect.promise(() =>
          db.insert(episodes).values([
            {
              animeId: 1,
              downloaded: true,
              filePath: "/lib/1.mkv",
              number: 1,
              title: null,
              aired: null,
            },
            { animeId: 1, downloaded: false, filePath: null, number: 2, title: null, aired: null },
            {
              animeId: 1,
              downloaded: true,
              filePath: "/lib/3.mkv",
              number: 3,
              title: null,
              aired: null,
            },
          ]),
        );
        assert.deepStrictEqual(yield* countEpisodeRows(db), 3);
        assert.deepStrictEqual(yield* countDownloadedEpisodeRows(db), 2);
      }),
    schema,
  }),
);

it.scoped("countRssFeedRows counts feeds", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db.insert(anime).values({
            addedAt: "2025-01-01T00:00:00.000Z",
            episodeCount: 12,
            format: "TV",
            genres: "[]",
            monitored: true,
            profileName: "Default",
            releaseProfileIds: "[]",
            rootFolder: "/lib/A",
            status: "FINISHED",
            studios: "[]",
            titleRomaji: "A",
          }),
        );
        yield* Effect.promise(() =>
          db.insert(rssFeeds).values({
            animeId: 1,
            createdAt: "2025-01-01T00:00:00.000Z",
            enabled: true,
            url: "https://a.com/rss",
          }),
        );
        assert.deepStrictEqual(yield* countRssFeedRows(db), 1);
      }),
    schema,
  }),
);

it.scoped("countQueuedDownloads and countActiveDownloads count by status", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db.insert(anime).values([
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              episodeCount: 12,
              format: "TV",
              genres: "[]",
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: "/lib/1",
              status: "FINISHED",
              studios: "[]",
              titleRomaji: "Q1",
            },
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              episodeCount: 12,
              format: "TV",
              genres: "[]",
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: "/lib/2",
              status: "FINISHED",
              studios: "[]",
              titleRomaji: "D1",
            },
          ]),
        );
        yield* Effect.promise(() =>
          db.insert(downloads).values([
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              animeId: 1,
              animeTitle: "Q1",
              contentPath: null,
              coveredEpisodes: null,
              downloadDate: null,
              downloadedBytes: 0,
              episodeNumber: 1,
              errorMessage: null,
              etaSeconds: null,
              externalState: "queued",
              groupName: null,
              infoHash: "q1",
              isBatch: false,
              lastSyncedAt: "2025-01-01T00:00:00.000Z",
              magnet: "magnet:?q1",
              progress: 0,
              savePath: null,
              sourceMetadata: null,
              speedBytes: 0,
              status: "queued",
              torrentName: "Q1",
              totalBytes: 0,
            },
            {
              addedAt: "2025-01-02T00:00:00.000Z",
              animeId: 2,
              animeTitle: "D1",
              contentPath: null,
              coveredEpisodes: null,
              downloadDate: null,
              downloadedBytes: 0,
              episodeNumber: 2,
              errorMessage: null,
              etaSeconds: null,
              externalState: "downloading",
              groupName: null,
              infoHash: "d2",
              isBatch: false,
              lastSyncedAt: "2025-01-02T00:00:00.000Z",
              magnet: "magnet:?d2",
              progress: 50,
              savePath: null,
              sourceMetadata: null,
              speedBytes: 1024,
              status: "downloading",
              torrentName: "D1",
              totalBytes: 1024,
            },
            {
              addedAt: "2025-01-03T00:00:00.000Z",
              animeId: 1,
              animeTitle: "Q1",
              contentPath: null,
              coveredEpisodes: null,
              downloadDate: null,
              downloadedBytes: 0,
              episodeNumber: 2,
              errorMessage: null,
              etaSeconds: null,
              externalState: "completed",
              groupName: null,
              infoHash: "q2",
              isBatch: false,
              lastSyncedAt: "2025-01-03T00:00:00.000Z",
              magnet: "magnet:?q2",
              progress: 100,
              savePath: null,
              sourceMetadata: null,
              speedBytes: 0,
              status: "completed",
              torrentName: "Q1 ep2",
              totalBytes: 1024,
            },
          ]),
        );
        assert.deepStrictEqual(yield* countQueuedDownloads(db), 1);
        assert.deepStrictEqual(yield* countActiveDownloads(db), 1);
        assert.deepStrictEqual(yield* countCompletedDownloads(db), 1);
      }),
    schema,
  }),
);

it.scoped("loadSystemLibraryStatsAggregate aggregates all library stats", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db.insert(anime).values({
            addedAt: "2025-01-01T00:00:00.000Z",
            episodeCount: 2,
            format: "TV",
            genres: "[]",
            monitored: true,
            profileName: "Default",
            releaseProfileIds: "[]",
            rootFolder: "/lib/A",
            status: "FINISHED",
            studios: "[]",
            titleRomaji: "A",
          }),
        );
        yield* Effect.promise(() =>
          db.insert(episodes).values([
            {
              animeId: 1,
              downloaded: true,
              filePath: "/lib/1.mkv",
              number: 1,
              title: null,
              aired: null,
            },
            {
              animeId: 1,
              downloaded: true,
              filePath: "/lib/2.mkv",
              number: 2,
              title: null,
              aired: null,
            },
          ]),
        );
        yield* Effect.promise(() =>
          db.insert(downloads).values({
            addedAt: "2025-01-01T00:00:00.000Z",
            animeId: 1,
            animeTitle: "A",
            contentPath: null,
            coveredEpisodes: null,
            downloadDate: null,
            downloadedBytes: 0,
            episodeNumber: 1,
            errorMessage: null,
            etaSeconds: null,
            externalState: "completed",
            groupName: null,
            infoHash: "hhh",
            isBatch: false,
            lastSyncedAt: "2025-01-01T00:00:00.000Z",
            magnet: "magnet:?hhh",
            progress: 100,
            savePath: null,
            sourceMetadata: null,
            speedBytes: 0,
            status: "completed",
            torrentName: "A 01",
            totalBytes: 0,
          }),
        );

        const stats = yield* loadSystemLibraryStatsAggregate(db);
        assert.deepStrictEqual(stats.totalAnime, 1);
        assert.deepStrictEqual(stats.monitoredAnime, 1);
        assert.deepStrictEqual(stats.totalEpisodes, 2);
        assert.deepStrictEqual(stats.downloadedEpisodes, 2);
        assert.deepStrictEqual(stats.totalRssFeeds, 0);
        assert.deepStrictEqual(stats.completedDownloads, 1);
        assert.deepStrictEqual(stats.upToDateAnime, 1);
      }),
    schema,
  }),
);

it.scoped("loadSystemDownloadStatsAggregate aggregates download status counts", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          db.insert(anime).values([
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              episodeCount: 12,
              format: "TV",
              genres: "[]",
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: "/lib/1",
              status: "FINISHED",
              studios: "[]",
              titleRomaji: "Q",
            },
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              episodeCount: 12,
              format: "TV",
              genres: "[]",
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: "/lib/2",
              status: "FINISHED",
              studios: "[]",
              titleRomaji: "D",
            },
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              episodeCount: 12,
              format: "TV",
              genres: "[]",
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: "/lib/3",
              status: "FINISHED",
              studios: "[]",
              titleRomaji: "E",
            },
          ]),
        );
        yield* Effect.promise(() =>
          db.insert(downloads).values([
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              animeId: 1,
              animeTitle: "Q",
              contentPath: null,
              coveredEpisodes: null,
              downloadDate: null,
              downloadedBytes: 0,
              episodeNumber: 1,
              errorMessage: null,
              etaSeconds: null,
              externalState: "queued",
              groupName: null,
              infoHash: "q1",
              isBatch: false,
              lastSyncedAt: "2025-01-01T00:00:00.000Z",
              magnet: "magnet:?q1",
              progress: 0,
              savePath: null,
              sourceMetadata: null,
              speedBytes: 0,
              status: "queued",
              torrentName: "Q",
              totalBytes: 0,
            },
            {
              addedAt: "2025-01-02T00:00:00.000Z",
              animeId: 2,
              animeTitle: "D",
              contentPath: null,
              coveredEpisodes: null,
              downloadDate: null,
              downloadedBytes: 0,
              episodeNumber: 2,
              errorMessage: null,
              etaSeconds: null,
              externalState: "downloading",
              groupName: null,
              infoHash: "d2",
              isBatch: false,
              lastSyncedAt: "2025-01-02T00:00:00.000Z",
              magnet: "magnet:?d2",
              progress: 50,
              savePath: null,
              sourceMetadata: null,
              speedBytes: 100,
              status: "downloading",
              torrentName: "D",
              totalBytes: 200,
            },
            {
              addedAt: "2025-01-03T00:00:00.000Z",
              animeId: 3,
              animeTitle: "E",
              contentPath: null,
              coveredEpisodes: null,
              downloadDate: null,
              downloadedBytes: 0,
              episodeNumber: 3,
              errorMessage: "fail",
              etaSeconds: null,
              externalState: "error",
              groupName: null,
              infoHash: "e3",
              isBatch: false,
              lastSyncedAt: "2025-01-03T00:00:00.000Z",
              magnet: "magnet:?e3",
              progress: 0,
              savePath: null,
              sourceMetadata: null,
              speedBytes: 0,
              status: "error",
              torrentName: "E",
              totalBytes: 0,
            },
          ]),
        );

        const stats = yield* loadSystemDownloadStatsAggregate(db);
        assert.deepStrictEqual(stats.queuedDownloads, 1);
        assert.deepStrictEqual(stats.activeDownloads, 1);
        assert.deepStrictEqual(stats.failedDownloads, 1);
        assert.deepStrictEqual(stats.importedDownloads, 0);
      }),
    schema,
  }),
);

it.scoped("listBackgroundJobRows returns empty when no jobs", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const rows = yield* listBackgroundJobRows(db);
        assert.deepStrictEqual(rows, []);
      }),
    schema,
  }),
);

it.scoped("listRecentSystemLogRows returns empty when no logs", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const rows = yield* listRecentSystemLogRows(db, 10);
        assert.deepStrictEqual(rows, []);
      }),
    schema,
  }),
);

it.scoped("loadSystemLogPage returns paginated results", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const { rows, total } = yield* loadSystemLogPage(db, { page: 1, pageSize: 10 });
        assert.deepStrictEqual(total, 0);
        assert.deepStrictEqual(rows, []);
      }),
    schema,
  }),
);
