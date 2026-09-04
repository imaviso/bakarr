import { Cause, Effect, Exit } from "effect";
import { assert, it } from "@effect/vitest";
import { brandMediaId } from "@packages/shared/index.ts";

import * as schema from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  media,
  backgroundJobs,
  downloads,
  mediaUnits,
  rssFeeds,
  systemLogs,
  unmappedFolderMatches,
} from "@/db/schema.ts";
import { StoredUnmappedFolderCorruptError } from "@/features/system/errors.ts";
import {
  countMediaRows,
  countDownloadedEpisodeRows,
  countEpisodeRows,
  countRssFeedRows,
  countUpToDateMediaRows,
} from "@/features/system/repository/stats-repository.ts";
import {
  countQueuedDownloads,
  countInProgressDownloads,
  countFailedDownloads,
  countCompletedDownloads,
  countImportedDownloads,
} from "@/test/download-stats-helpers.ts";
import { loadSystemLogPage } from "@/features/system/repository/log-repository.ts";

import {
  decodeUnmappedFolderMatchRow,
  listUnmappedFolderMatchRows,
  loadUnmappedFolderMatchRow,
  upsertUnmappedFolderMatchRows,
} from "@/features/system/repository/unmapped-repository.ts";

it.effect("system repository query helpers filter logs and count system state", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        yield* exec.runQuery(
          "Failed to seed systemLogs for repository test",
          db
            .insert(systemLogs)
            .values([
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
            ])
            .prepare()
            .effect(),
        );
        yield* exec.runQuery(
          "Failed to seed media for repository test",
          db
            .insert(media)
            .values({
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
              unitCount: 2,
              startDate: null,
              endDate: null,
              startYear: null,
              endYear: null,
              nextAiringAt: null,
              nextAiringUnit: null,
              profileName: "Default",
              rootFolder: "/library/Naruto",
              addedAt: "2024-01-01T00:00:00.000Z",
              monitored: true,
              releaseProfileIds: "[]",
            })
            .prepare()
            .effect(),
        );
        yield* exec.runQuery(
          "Failed to seed mediaUnits for query helpers test",
          db
            .insert(mediaUnits)
            .values([
              {
                mediaId: 20,
                number: 1,
                title: null,
                aired: null,
                downloaded: true,
                filePath: "/library/Naruto/01.mkv",
              },
              {
                mediaId: 20,
                number: 2,
                title: null,
                aired: null,
                downloaded: false,
                filePath: null,
              },
            ])
            .prepare()
            .effect(),
        );
        yield* exec.runQuery(
          "Failed to seed downloads for query helpers test",
          db
            .insert(downloads)
            .values([
              {
                mediaId: 20,
                mediaTitle: "Naruto",
                unitNumber: 1,
                isBatch: false,
                coveredUnits: null,
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
                mediaId: 20,
                mediaTitle: "Naruto",
                unitNumber: 2,
                isBatch: false,
                coveredUnits: null,
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
                mediaId: 20,
                mediaTitle: "Naruto",
                unitNumber: 3,
                isBatch: false,
                coveredUnits: null,
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
                mediaId: 20,
                mediaTitle: "Naruto",
                unitNumber: 4,
                isBatch: false,
                coveredUnits: null,
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
                mediaId: 20,
                mediaTitle: "Naruto",
                unitNumber: 5,
                isBatch: false,
                coveredUnits: null,
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
            ])
            .prepare()
            .effect(),
        );
        yield* exec.runQuery(
          "Failed to seed backgroundJobs for query helpers test",
          db
            .insert(backgroundJobs)
            .values([
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
            ])
            .prepare()
            .effect(),
        );
        yield* exec.runQuery(
          "Failed to seed rssFeed for query helpers test",
          db
            .insert(rssFeeds)
            .values({
              mediaId: 20,
              url: "https://example.com/rss.xml",
              name: null,
              lastChecked: null,
              enabled: true,
              createdAt: "2024-01-01T00:00:00.000Z",
            })
            .prepare()
            .effect(),
        );

        const scanPage = yield* loadSystemLogPage(db, exec, {
          eventType: "Scan",
          page: 1,
          pageSize: 10,
        });
        assert.deepStrictEqual(scanPage.total, 1);
        const [scanRow] = scanPage.rows;
        assert.deepStrictEqual(scanRow !== undefined, true);
        if (!scanRow) {
          return;
        }
        assert.deepStrictEqual(scanRow.message, "scan start");

        const errorPage = yield* loadSystemLogPage(db, exec, {
          level: "error",
          page: 1,
          pageSize: 10,
          startDate: "2024-01-02T00:00:00.000Z",
        });
        assert.deepStrictEqual(errorPage.total, 1);
        const [errorRow] = errorPage.rows;
        assert.deepStrictEqual(errorRow !== undefined, true);
        if (!errorRow) {
          return;
        }
        assert.deepStrictEqual(errorRow.eventType, "downloads.error");

        assert.deepStrictEqual(yield* countQueuedDownloads(db), 1);
        assert.deepStrictEqual(yield* countInProgressDownloads(db), 1);
        assert.deepStrictEqual(yield* countFailedDownloads(db), 1);
        assert.deepStrictEqual(yield* countCompletedDownloads(db), 1);
        assert.deepStrictEqual(yield* countImportedDownloads(db), 1);
        assert.deepStrictEqual(yield* countMediaRows(db, exec), 1);
        assert.deepStrictEqual(yield* countEpisodeRows(db, exec), 2);
        assert.deepStrictEqual(yield* countDownloadedEpisodeRows(db, exec), 1);
        assert.deepStrictEqual(yield* countRssFeedRows(db, exec), 1);
      }),
    schema,
  }),
);

it.effect("countUpToDateMediaRows counts monitored media with complete downloads", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        yield* exec.runQuery(
          "Failed to seed media for countUpToDateMediaRows test",
          db
            .insert(media)
            .values([
              {
                addedAt: "2024-01-01T00:00:00.000Z",
                bannerImage: null,
                coverImage: null,
                description: null,
                endDate: null,
                endYear: null,
                unitCount: 2,
                format: "TV",
                genres: "[]",
                id: 21,
                malId: null,
                monitored: true,
                nextAiringAt: null,
                nextAiringUnit: null,
                profileName: "Default",
                recommendedMedia: null,
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
                unitCount: 2,
                format: "TV",
                genres: "[]",
                id: 22,
                malId: null,
                monitored: false,
                nextAiringAt: null,
                nextAiringUnit: null,
                profileName: "Default",
                recommendedMedia: null,
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
              {
                addedAt: "2024-01-01T00:00:00.000Z",
                bannerImage: null,
                coverImage: null,
                description: null,
                endDate: null,
                endYear: null,
                unitCount: 2,
                format: "TV",
                genres: "[]",
                id: 23,
                malId: null,
                monitored: true,
                nextAiringAt: null,
                nextAiringUnit: null,
                profileName: "Default",
                recommendedMedia: null,
                releaseProfileIds: "[]",
                rootFolder: "/library/MonitoredPartial",
                score: null,
                startDate: null,
                startYear: null,
                status: "RELEASING",
                studios: "[]",
                synonyms: null,
                titleEnglish: null,
                titleNative: null,
                titleRomaji: "Monitored Partial",
              },
            ])
            .prepare()
            .effect(),
        );
        yield* exec.runQuery(
          "Failed to seed mediaUnits for countUpToDateMediaRows test",
          db
            .insert(mediaUnits)
            .values([
              {
                mediaId: 21,
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
                mediaId: 21,
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
                mediaId: 22,
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
                mediaId: 22,
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
                mediaId: 22,
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
              {
                mediaId: 23,
                aired: null,
                audioChannels: null,
                audioCodec: null,
                downloaded: true,
                durationSeconds: null,
                filePath: "/library/MonitoredPartial/01.mkv",
                fileSize: null,
                groupName: null,
                number: 1,
                quality: null,
                resolution: null,
                title: null,
                videoCodec: null,
              },
              {
                mediaId: 23,
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
            ])
            .prepare()
            .effect(),
        );

        assert.deepStrictEqual(yield* countUpToDateMediaRows(db, exec), 1);
      }),
    schema,
  }),
);

it.effect("unmapped folder match rows persist cached suggestions", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        yield* upsertUnmappedFolderMatchRows(
          db,
          exec,
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
                  id: brandMediaId(20),
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

        const rows = yield* listUnmappedFolderMatchRows(db, exec);
        assert.deepStrictEqual(rows.length, 1);
        assert.deepStrictEqual(rows[0]?.path, "/library/Naruto Archive");

        const decoded = yield* decodeUnmappedFolderMatchRow(rows[0]!);
        assert.deepStrictEqual(decoded.match_status, "done");
        assert.deepStrictEqual(decoded.search_queries, ["Naruto Archive"]);
        assert.deepStrictEqual(decoded.suggested_matches[0]?.id, 20);
        assert.deepStrictEqual(decoded.suggested_matches[0]?.match_confidence, 0.97);
      }),
    schema,
  }),
);

it.effect("decodeUnmappedFolderMatchRow fails for corrupt stored suggestions", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        yield* exec.runQuery(
          "Failed to seed corrupt unmappedFolderMatch",
          db
            .insert(unmappedFolderMatches)
            .values({
              lastMatchedAt: null,
              lastMatchError: null,
              matchAttempts: 0,
              matchStatus: "pending",
              name: "Broken",
              path: "/library/Broken",
              size: 0,
              suggestedMatches: "not-json",
              updatedAt: "2024-01-01T00:00:00.000Z",
            })
            .prepare()
            .effect(),
        );

        const row = yield* loadUnmappedFolderMatchRow(db, exec, "/library/Broken");
        const exit = yield* Effect.exit(decodeUnmappedFolderMatchRow(row!));

        assert.deepStrictEqual(Exit.isFailure(exit), true);
        if (Exit.isFailure(exit)) {
          const failure = Cause.findErrorOption(exit.cause);
          assert.deepStrictEqual(failure._tag, "Some");
          if (failure._tag === "Some") {
            assert.deepStrictEqual(failure.value instanceof StoredUnmappedFolderCorruptError, true);
          }
        }
      }),
    schema,
  }),
);

it.effect("loadUnmappedFolderMatchRow returns a row by folder path", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, _client, exec) =>
      Effect.gen(function* () {
        yield* upsertUnmappedFolderMatchRows(
          db,
          exec,
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

        const row = yield* loadUnmappedFolderMatchRow(db, exec, "/library/Naruto Archive");

        assert.deepStrictEqual(row?.path, "/library/Naruto Archive");
        assert.deepStrictEqual(row?.matchStatus, "paused");
      }),
    schema,
  }),
);
