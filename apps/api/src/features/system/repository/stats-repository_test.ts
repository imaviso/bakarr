import { assert, it } from "@effect/vitest";

import * as schema from "@/db/schema.ts";
import { media, mediaUnits, downloads, rssFeeds } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  countMediaRows,
  countMonitoredMediaRows,
  countEpisodeRows,
  countDownloadedEpisodeRows,
  countRssFeedRows,
  loadSystemLibraryStatsAggregate,
  listBackgroundJobRows,
  listRecentSystemLogRows,
} from "@/features/system/repository/stats-repository.ts";
import { loadSystemLogPage } from "@/features/system/repository/log-repository.ts";
import { Effect } from "effect";

it.effect("countMediaRows returns 0 for empty table", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        const count = yield* countMediaRows(db, exec);
        assert.deepStrictEqual(count, 0);
      }),
    schema,
  }),
);

it.effect("countMediaRows counts inserted rows", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        yield* exec.runQuery(
          "Failed to seed media for count test",
          db
            .insert(media)
            .values([
              {
                addedAt: "2025-01-01T00:00:00.000Z",
                unitCount: 12,
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
                unitCount: 24,
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
            ])
            .prepare()
            .effect(),
        );
        assert.deepStrictEqual(yield* countMediaRows(db, exec), 2);
        assert.deepStrictEqual(yield* countMonitoredMediaRows(db, exec), 1);
      }),
    schema,
  }),
);

it.effect("countEpisodeRows and countDownloadedEpisodeRows count correctly", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        yield* exec.runQuery(
          "Failed to seed media row",
          db
            .insert(media)
            .values({
              addedAt: "2025-01-01T00:00:00.000Z",
              unitCount: 12,
              format: "TV",
              genres: "[]",
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: "/lib/A",
              status: "FINISHED",
              studios: "[]",
              titleRomaji: "A",
            })
            .prepare()
            .effect(),
        );
        yield* exec.runQuery(
          "Failed to seed mediaUnits",
          db
            .insert(mediaUnits)
            .values([
              {
                mediaId: 1,
                downloaded: true,
                filePath: "/lib/1.mkv",
                number: 1,
                title: null,
                aired: null,
              },
              {
                mediaId: 1,
                downloaded: false,
                filePath: null,
                number: 2,
                title: null,
                aired: null,
              },
              {
                mediaId: 1,
                downloaded: true,
                filePath: "/lib/3.mkv",
                number: 3,
                title: null,
                aired: null,
              },
            ])
            .prepare()
            .effect(),
        );
        assert.deepStrictEqual(yield* countEpisodeRows(db, exec), 3);
        assert.deepStrictEqual(yield* countDownloadedEpisodeRows(db, exec), 2);
      }),
    schema,
  }),
);

it.effect("countRssFeedRows counts feeds", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        yield* exec.runQuery(
          "Failed to seed media row",
          db
            .insert(media)
            .values({
              addedAt: "2025-01-01T00:00:00.000Z",
              unitCount: 12,
              format: "TV",
              genres: "[]",
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: "/lib/A",
              status: "FINISHED",
              studios: "[]",
              titleRomaji: "A",
            })
            .prepare()
            .effect(),
        );
        yield* exec.runQuery(
          "Failed to seed rssFeeds",
          db
            .insert(rssFeeds)
            .values({
              mediaId: 1,
              createdAt: "2025-01-01T00:00:00.000Z",
              enabled: true,
              url: "https://a.com/rss",
            })
            .prepare()
            .effect(),
        );
        assert.deepStrictEqual(yield* countRssFeedRows(db, exec), 1);
      }),
    schema,
  }),
);

it.effect("loadSystemLibraryStatsAggregate aggregates all library stats", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        yield* exec.runQuery(
          "Failed to seed media row",
          db
            .insert(media)
            .values({
              addedAt: "2025-01-01T00:00:00.000Z",
              unitCount: 2,
              format: "TV",
              genres: "[]",
              monitored: true,
              profileName: "Default",
              releaseProfileIds: "[]",
              rootFolder: "/lib/A",
              status: "FINISHED",
              studios: "[]",
              titleRomaji: "A",
            })
            .prepare()
            .effect(),
        );
        yield* exec.runQuery(
          "Failed to seed mediaUnits",
          db
            .insert(mediaUnits)
            .values([
              {
                mediaId: 1,
                downloaded: true,
                filePath: "/lib/1.mkv",
                number: 1,
                title: null,
                aired: null,
              },
              {
                mediaId: 1,
                downloaded: true,
                filePath: "/lib/2.mkv",
                number: 2,
                title: null,
                aired: null,
              },
            ])
            .prepare()
            .effect(),
        );
        yield* exec.runQuery(
          "Failed to seed download row",
          db
            .insert(downloads)
            .values({
              addedAt: "2025-01-01T00:00:00.000Z",
              mediaId: 1,
              mediaTitle: "A",
              contentPath: null,
              coveredUnits: null,
              downloadDate: null,
              downloadedBytes: 0,
              unitNumber: 1,
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
            })
            .prepare()
            .effect(),
        );

        const stats = yield* loadSystemLibraryStatsAggregate(db, exec);
        assert.deepStrictEqual(stats.totalAnime, 1);
        assert.deepStrictEqual(stats.monitoredAnime, 1);
        assert.deepStrictEqual(stats.totalUnits, 2);
        assert.deepStrictEqual(stats.downloadedUnits, 2);
        assert.deepStrictEqual(stats.totalRssFeeds, 0);
        assert.deepStrictEqual(stats.completedDownloads, 1);
        assert.deepStrictEqual(stats.upToDateAnime, 1);
      }),
    schema,
  }),
);

it.effect("listBackgroundJobRows returns empty when no jobs", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        const rows = yield* listBackgroundJobRows(db, exec);
        assert.deepStrictEqual(rows, []);
      }),
    schema,
  }),
);

it.effect("listRecentSystemLogRows returns empty when no logs", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        const rows = yield* listRecentSystemLogRows(db, exec, 10);
        assert.deepStrictEqual(rows, []);
      }),
    schema,
  }),
);

it.effect("loadSystemLogPage returns paginated results", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        const { rows, total } = yield* loadSystemLogPage(db, exec, { page: 1, pageSize: 10 });
        assert.deepStrictEqual(total, 0);
        assert.deepStrictEqual(rows, []);
      }),
    schema,
  }),
);
