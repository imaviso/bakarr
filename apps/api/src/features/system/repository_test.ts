import { assertEquals, assertRejects } from "@std/assert";
import { Effect } from "effect";

import * as schema from "../../db/schema.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import { withSqliteTestDb } from "../../test/database-test.ts";
import {
  anime,
  backgroundJobs,
  downloads,
  episodes,
  rssFeeds,
  systemLogs,
} from "../../db/schema.ts";
import { encodeConfigCore } from "./config-codec.ts";
import { makeDefaultConfig } from "./defaults.ts";
import {
  countActiveDownloads,
  countAnimeRows,
  countCompletedDownloads,
  countDownloadedEpisodeRows,
  countEpisodeRows,
  countFailedDownloads,
  countImportedDownloads,
  countQueuedDownloads,
  countQueuedOrDownloadingDownloads,
  countRssFeedRows,
  countRunningBackgroundJobs,
  decodeUnmappedFolderMatchRow,
  insertSystemConfigRow,
  listQualityProfileRows,
  listUnmappedFolderMatchRows,
  loadSystemConfigRow,
  loadSystemLogPage,
  loadUnmappedFolderMatchRow,
  replaceQualityProfileRows,
  upsertSystemConfigRow,
  upsertUnmappedFolderMatchRows,
} from "./repository.ts";

Deno.test("system repository config helpers insert and upsert config rows", async () => {
  await withTestDb(async (db, databaseFile) => {
    await Effect.runPromise(insertSystemConfigRow(db, {
      id: 1,
      data: encodeConfigCore(makeDefaultConfig(databaseFile)),
      updatedAt: "2024-01-01T00:00:00.000Z",
    }));

    const initial = await Effect.runPromise(loadSystemConfigRow(db));
    assertEquals(initial?.id, 1);

    await Effect.runPromise(upsertSystemConfigRow(db, {
      id: 1,
      data: encodeConfigCore({
        ...makeDefaultConfig(databaseFile),
        library: {
          ...makeDefaultConfig(databaseFile).library,
          library_path: "/new-library",
        },
      }),
      updatedAt: "2024-01-02T00:00:00.000Z",
    }));

    const updated = await Effect.runPromise(loadSystemConfigRow(db));
    assertEquals(updated?.updatedAt, "2024-01-02T00:00:00.000Z");
    assertEquals(updated?.data.includes("/new-library"), true);
  });
});

Deno.test("system repository query helpers filter logs and count system state", async () => {
  await withTestDb(async (db, _databaseFile) => {
    await db.insert(systemLogs).values([
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
    ]);
    await db.insert(anime).values({
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
    });
    await db.insert(episodes).values([
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
    ]);
    await db.insert(downloads).values([
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
    ]);
    await db.insert(backgroundJobs).values([
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
    ]);
    await db.insert(rssFeeds).values({
      animeId: 20,
      url: "https://example.com/rss.xml",
      name: null,
      lastChecked: null,
      enabled: true,
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const scanPage = await Effect.runPromise(loadSystemLogPage(db, {
      eventType: "Scan",
      page: 1,
      pageSize: 10,
    }));
    assertEquals(scanPage.total, 1);
    assertEquals(scanPage.rows[0].message, "scan start");

    const errorPage = await Effect.runPromise(loadSystemLogPage(db, {
      level: "error",
      page: 1,
      pageSize: 10,
      startDate: "2024-01-02T00:00:00.000Z",
    }));
    assertEquals(errorPage.total, 1);
    assertEquals(errorPage.rows[0].eventType, "downloads.error");

    assertEquals(
      await Effect.runPromise(countQueuedOrDownloadingDownloads(db)),
      1,
    );
    assertEquals(await Effect.runPromise(countQueuedDownloads(db)), 1);
    assertEquals(await Effect.runPromise(countActiveDownloads(db)), 1);
    assertEquals(await Effect.runPromise(countFailedDownloads(db)), 1);
    assertEquals(await Effect.runPromise(countCompletedDownloads(db)), 1);
    assertEquals(await Effect.runPromise(countImportedDownloads(db)), 1);
    assertEquals(await Effect.runPromise(countRunningBackgroundJobs(db)), 1);
    assertEquals(await Effect.runPromise(countAnimeRows(db)), 1);
    assertEquals(await Effect.runPromise(countEpisodeRows(db)), 2);
    assertEquals(await Effect.runPromise(countDownloadedEpisodeRows(db)), 1);
    assertEquals(await Effect.runPromise(countRssFeedRows(db)), 1);
  });
});

Deno.test("replaceQualityProfileRows rolls back when replacement insert fails", async () => {
  await withTestDb(async (db) => {
    await db.insert(schema.qualityProfiles).values({
      name: "Existing",
      cutoff: "1080p",
      upgradeAllowed: true,
      seadexPreferred: false,
      allowedQualities: '["1080p"]',
      minSize: null,
      maxSize: null,
    });

    await assertRejects(() =>
      Effect.runPromise(replaceQualityProfileRows(db, [
        {
          name: "Duplicate",
          cutoff: "1080p",
          upgradeAllowed: true,
          seadexPreferred: false,
          allowedQualities: '["1080p"]',
          minSize: null,
          maxSize: null,
        },
        {
          name: "Duplicate",
          cutoff: "720p",
          upgradeAllowed: false,
          seadexPreferred: false,
          allowedQualities: '["720p"]',
          minSize: null,
          maxSize: null,
        },
      ]))
    );

    const rows = await Effect.runPromise(listQualityProfileRows(db));
    assertEquals(rows.length, 1);
    assertEquals(rows[0]?.name, "Existing");
  });
});

Deno.test("unmapped folder match rows persist cached suggestions", async () => {
  await withTestDb(async (db) => {
    await Effect.runPromise(upsertUnmappedFolderMatchRows(db, [{
      last_matched_at: "2024-01-01T00:00:00.000Z",
      match_status: "done",
      name: "Naruto Archive",
      path: "/library/Naruto Archive",
      size: 0,
      suggested_matches: [{
        already_in_library: true,
        id: 20,
        match_confidence: 0.97,
        match_reason:
          'Matched a library title from the normalized folder name "Naruto Archive"',
        title: { romaji: "Naruto" },
      }],
    }]));

    const rows = await Effect.runPromise(listUnmappedFolderMatchRows(db));
    assertEquals(rows.length, 1);
    assertEquals(rows[0]?.path, "/library/Naruto Archive");

    const decoded = decodeUnmappedFolderMatchRow(rows[0]!);
    assertEquals(decoded.match_status, "done");
    assertEquals(decoded.search_queries, ["Naruto Archive"]);
    assertEquals(decoded.suggested_matches[0]?.id, 20);
    assertEquals(decoded.suggested_matches[0]?.match_confidence, 0.97);
  });
});

Deno.test("loadUnmappedFolderMatchRow returns a row by folder path", async () => {
  await withTestDb(async (db) => {
    await Effect.runPromise(upsertUnmappedFolderMatchRows(db, [{
      match_status: "paused",
      name: "Naruto Archive",
      path: "/library/Naruto Archive",
      size: 0,
      suggested_matches: [],
    }]));

    const row = await Effect.runPromise(
      loadUnmappedFolderMatchRow(db, "/library/Naruto Archive"),
    );

    assertEquals(row?.path, "/library/Naruto Archive");
    assertEquals(row?.matchStatus, "paused");
  });
});

async function withTestDb(
  run: (db: AppDatabase, databaseFile: string) => Promise<void>,
) {
  await withSqliteTestDb({
    migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER,
    run: (db, databaseFile) => run(db as AppDatabase, databaseFile),
    schema,
  });
}
