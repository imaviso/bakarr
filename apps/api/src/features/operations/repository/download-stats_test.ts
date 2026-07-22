import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import * as schema from "@/db/schema.ts";
import { media, downloads } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import {
  countQueuedDownloads,
  countInProgressDownloads,
  countCompletedDownloads,
  countFailedDownloads,
  countImportedDownloads,
} from "@/test/download-stats-helpers.ts";
import { loadDownloadStatusStats } from "@/features/operations/repository/download-catalog-read.ts";

it.scoped("countQueuedDownloads and countInProgressDownloads count by status", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* tryDatabasePromise("Failed to seed media for count test", () =>
          db.insert(media).values([
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
              titleRomaji: "Q1",
            },
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              unitCount: 12,
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
        yield* tryDatabasePromise("Failed to seed downloads", () =>
          db.insert(downloads).values([
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              mediaId: 1,
              mediaTitle: "Q1",
              contentPath: null,
              coveredUnits: null,
              downloadDate: null,
              downloadedBytes: 0,
              unitNumber: 1,
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
              mediaId: 2,
              mediaTitle: "D1",
              contentPath: null,
              coveredUnits: null,
              downloadDate: null,
              downloadedBytes: 0,
              unitNumber: 2,
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
              mediaId: 1,
              mediaTitle: "Q1",
              contentPath: null,
              coveredUnits: null,
              downloadDate: null,
              downloadedBytes: 0,
              unitNumber: 2,
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
        assert.deepStrictEqual(yield* countInProgressDownloads(db), 1);
        assert.deepStrictEqual(yield* countCompletedDownloads(db), 1);
      }),
    schema,
  }),
);

it.scoped("loadDownloadStatusStats aggregates download status counts", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* tryDatabasePromise("Failed to seed media for count test", () =>
          db.insert(media).values([
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
              titleRomaji: "Q",
            },
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              unitCount: 12,
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
              unitCount: 12,
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
        yield* tryDatabasePromise("Failed to seed downloads", () =>
          db.insert(downloads).values([
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              mediaId: 1,
              mediaTitle: "Q",
              contentPath: null,
              coveredUnits: null,
              downloadDate: null,
              downloadedBytes: 0,
              unitNumber: 1,
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
              mediaId: 2,
              mediaTitle: "D",
              contentPath: null,
              coveredUnits: null,
              downloadDate: null,
              downloadedBytes: 0,
              unitNumber: 2,
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
              mediaId: 3,
              mediaTitle: "E",
              contentPath: null,
              coveredUnits: null,
              downloadDate: null,
              downloadedBytes: 0,
              unitNumber: 3,
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

        const stats = yield* loadDownloadStatusStats(db);
        assert.deepStrictEqual(stats.queuedDownloads, 1);
        assert.deepStrictEqual(stats.activeDownloads, 1);
        assert.deepStrictEqual(stats.failedDownloads, 1);
        assert.deepStrictEqual(stats.importedDownloads, 0);
      }),
    schema,
  }),
);

it.scoped("countFailedDownloads and countImportedDownloads count by status", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* tryDatabasePromise("Failed to seed media for count test", () =>
          db.insert(media).values({
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
            titleRomaji: "X",
          }),
        );
        yield* tryDatabasePromise("Failed to seed downloads", () =>
          db.insert(downloads).values([
            {
              addedAt: "2025-01-01T00:00:00.000Z",
              mediaId: 1,
              mediaTitle: "X",
              contentPath: null,
              coveredUnits: null,
              downloadDate: null,
              downloadedBytes: 0,
              unitNumber: 1,
              errorMessage: "err",
              etaSeconds: null,
              externalState: "error",
              groupName: null,
              infoHash: "f1",
              isBatch: false,
              lastSyncedAt: "2025-01-01T00:00:00.000Z",
              magnet: "magnet:?f1",
              progress: 0,
              savePath: null,
              sourceMetadata: null,
              speedBytes: 0,
              status: "error",
              torrentName: "X",
              totalBytes: 0,
            },
            {
              addedAt: "2025-01-02T00:00:00.000Z",
              mediaId: 1,
              mediaTitle: "X",
              contentPath: null,
              coveredUnits: null,
              downloadDate: null,
              downloadedBytes: 0,
              unitNumber: 2,
              errorMessage: null,
              etaSeconds: null,
              externalState: "imported",
              groupName: null,
              infoHash: "i2",
              isBatch: false,
              lastSyncedAt: "2025-01-02T00:00:00.000Z",
              magnet: "magnet:?i2",
              progress: 100,
              savePath: null,
              sourceMetadata: null,
              speedBytes: 0,
              status: "imported",
              torrentName: "X2",
              totalBytes: 0,
            },
          ]),
        );
        assert.deepStrictEqual(yield* countFailedDownloads(db), 1);
        assert.deepStrictEqual(yield* countImportedDownloads(db), 1);
      }),
    schema,
  }),
);
