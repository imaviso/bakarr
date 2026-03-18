import { assertEquals, assertExists } from "@std/assert";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { Effect } from "effect";

import type { NotificationEvent } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import * as schema from "../../db/schema.ts";
import { anime, appConfig, downloads, episodes } from "../../db/schema.ts";
import { DRIZZLE_MIGRATIONS_FOLDER } from "../../db/migrate.ts";
import { FileSystemError, type FileSystemShape } from "../../lib/filesystem.ts";
import { runTestEffect } from "../../test/effect-test.ts";
import { encodeConfigCore, encodeNumberList } from "../system/config-codec.ts";
import { makeDefaultConfig } from "../system/defaults.ts";
import { EventBus } from "../events/event-bus.ts";
import { QBitTorrentClient } from "./qbittorrent.ts";
import {
  decodeDownloadSourceMetadata,
  encodeDownloadSourceMetadata,
  loadDownloadPresentationContexts,
} from "./repository.ts";
import {
  dbError,
  maybeQBitConfig,
  tryDatabasePromise,
  tryOperationsPromise,
  wrapOperationsError,
} from "./service-support.ts";
import { makeDownloadOrchestration } from "./download-orchestration.ts";

Deno.test("triggerDownload persists merged release provenance on queued downloads", async () => {
  await withTestDb(async (db, databaseFile) => {
    const libraryDir = await Deno.makeTempDir();

    try {
      await seedConfig(db, databaseFile, (config) => ({
        ...config,
        library: {
          ...config.library,
          naming_format: "{title} - {source_episode_segment}",
        },
      }));
      await db.insert(anime).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        bannerImage: null,
        coverImage: null,
        description: null,
        endDate: null,
        endYear: null,
        episodeCount: 12,
        format: "TV",
        genres: "[]",
        id: 1,
        malId: null,
        monitored: true,
        nextAiringAt: null,
        nextAiringEpisode: null,
        profileName: "Default",
        releaseProfileIds: encodeNumberList([]),
        rootFolder: libraryDir,
        score: null,
        startDate: "2025-01-01",
        startYear: 2025,
        status: "RELEASING",
        studios: "[]",
        titleEnglish: "Show",
        titleNative: null,
        titleRomaji: "Show",
      });

      const events: NotificationEvent[] = [];
      const orchestration = await createDownloadOrchestrationForTest(
        db,
        events,
      );

      await runTestEffect(
        orchestration.triggerDownload({
          anime_id: 1,
          decision_reason: "Manual grab from release search",
          episode_number: 1,
          group: "SubsPlease",
          info_hash: "abcdef1234567890abcdef1234567890abcdef12",
          magnet:
            "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=Show",
          release_metadata: {
            resolution: "720p",
            source_url: "https://nyaa.si/view/123",
            trusted: true,
          },
          title: "[SubsPlease] Show - 01 (1080p) [HEVC] [AAC 2.0]",
        }),
      );

      const rows = await db.select().from(downloads).limit(1);
      const row = rows[0];
      assertExists(row);
      const sourceMetadata = decodeDownloadSourceMetadata(row.sourceMetadata);

      assertEquals(row.status, "queued");
      assertEquals(row.coveredEpisodes, "[1]");
      assertEquals(sourceMetadata?.group, "SubsPlease");
      assertEquals(sourceMetadata?.parsed_title, "Show");
      assertEquals(sourceMetadata?.resolution, "720p");
      assertEquals(sourceMetadata?.video_codec, "HEVC");
      assertEquals(sourceMetadata?.audio_codec, "AAC");
      assertEquals(sourceMetadata?.audio_channels, "2.0");
      assertEquals(
        sourceMetadata?.decision_reason,
        "Manual grab from release search",
      );
      assertEquals(sourceMetadata?.indexer, "Nyaa");
      assertEquals(sourceMetadata?.selection_kind, "manual");
      assertEquals(sourceMetadata?.trusted, true);
      assertEquals(sourceMetadata?.source_url, "https://nyaa.si/view/123");
      assertEquals(sourceMetadata?.source_identity, {
        episode_numbers: [1],
        label: "01",
        scheme: "absolute",
      });
      assertEquals(events.map((event) => event.type), [
        "DownloadStarted",
        "DownloadProgress",
      ]);
      assertEquals(events[0]?.type, "DownloadStarted");
      if (events[0]?.type === "DownloadStarted") {
        assertEquals(events[0].payload.source_metadata?.indexer, "Nyaa");
        assertEquals(events[0].payload.source_metadata?.resolution, "720p");
      }
    } finally {
      await Deno.remove(libraryDir, { recursive: true }).catch(() => undefined);
    }
  });
});

Deno.test("triggerDownload stores source metadata in queued download event payload", async () => {
  await withTestDb(async (db, databaseFile) => {
    const libraryDir = await Deno.makeTempDir();

    try {
      await seedConfig(db, databaseFile, (config) => config);
      await db.insert(anime).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        bannerImage: null,
        coverImage: null,
        description: null,
        endDate: null,
        endYear: null,
        episodeCount: 12,
        format: "TV",
        genres: "[]",
        id: 1,
        malId: null,
        monitored: true,
        nextAiringAt: null,
        nextAiringEpisode: null,
        profileName: "Default",
        releaseProfileIds: encodeNumberList([]),
        rootFolder: libraryDir,
        score: null,
        startDate: "2025-01-01",
        startYear: 2025,
        status: "RELEASING",
        studios: "[]",
        titleEnglish: "Show",
        titleNative: null,
        titleRomaji: "Show",
      });

      const orchestration = await createDownloadOrchestrationForTest(db, []);

      await runTestEffect(
        orchestration.triggerDownload({
          anime_id: 1,
          decision_reason: "Manual grab from release search",
          episode_number: 1,
          group: "SubsPlease",
          info_hash: "abcdef1234567890abcdef1234567890abcdef12",
          magnet:
            "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=Show",
          release_metadata: {
            resolution: "720p",
            source_url: "https://nyaa.si/view/123",
            trusted: true,
          },
          title: "[SubsPlease] Show - 01 (1080p) [HEVC] [AAC 2.0]",
        }),
      );

      const events = await db.select().from(schema.downloadEvents).where(
        eq(schema.downloadEvents.eventType, "download.queued"),
      ).limit(1);
      const event = events[0];
      assertExists(event);

      const parsed = event.metadata ? JSON.parse(event.metadata) : undefined;
      assertExists(parsed);
      assertEquals(Array.isArray(parsed.covered_episodes), true);
      assertEquals(parsed.covered_episodes, [1]);
      assertEquals(parsed.source_metadata?.indexer, "Nyaa");
      assertEquals(parsed.source_metadata?.resolution, "720p");
      assertEquals(parsed.source_metadata?.trusted, true);
      assertEquals(
        parsed.source_metadata?.decision_reason,
        "Manual grab from release search",
      );
    } finally {
      await Deno.remove(libraryDir, { recursive: true }).catch(() => undefined);
    }
  });
});

Deno.test("applyDownloadActionEffect stores structured metadata on pause and resume events", async () => {
  await withTestDb(async (db, databaseFile) => {
    const libraryDir = await Deno.makeTempDir();

    try {
      await seedConfig(db, databaseFile, (config) => config);
      await db.insert(anime).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        bannerImage: null,
        coverImage: null,
        description: null,
        endDate: null,
        endYear: null,
        episodeCount: 12,
        format: "TV",
        genres: "[]",
        id: 1,
        malId: null,
        monitored: true,
        nextAiringAt: null,
        nextAiringEpisode: null,
        profileName: "Default",
        releaseProfileIds: encodeNumberList([]),
        rootFolder: libraryDir,
        score: null,
        startDate: "2025-01-01",
        startYear: 2025,
        status: "RELEASING",
        studios: "[]",
        titleEnglish: "Show",
        titleNative: null,
        titleRomaji: "Show",
      });

      const [inserted] = await db.insert(downloads).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        animeId: 1,
        animeTitle: "Show",
        contentPath: null,
        coveredEpisodes: encodeNumberList([1, 2]),
        downloadDate: null,
        downloadedBytes: 10,
        episodeNumber: 1,
        errorMessage: null,
        etaSeconds: 0,
        externalState: "downloading",
        groupName: "SubsPlease",
        infoHash: null,
        isBatch: true,
        lastErrorAt: null,
        lastSyncedAt: "2024-01-01T00:00:00.000Z",
        magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
        progress: 12,
        reconciledAt: null,
        retryCount: 0,
        savePath: null,
        sourceMetadata: encodeDownloadSourceMetadata({
          indexer: "Nyaa",
          source_url: "https://nyaa.si/view/123",
          trusted: true,
        }),
        speedBytes: 0,
        status: "downloading",
        torrentName: "[SubsPlease] Show - 01-02",
        totalBytes: 100,
      }).returning({ id: downloads.id });

      const orchestration = await createDownloadOrchestrationForTest(db, []);

      await runTestEffect(
        orchestration.applyDownloadActionEffect(inserted.id, "pause"),
      );
      await runTestEffect(
        orchestration.applyDownloadActionEffect(inserted.id, "resume"),
      );

      const rows = await db.select().from(schema.downloadEvents).where(
        eq(schema.downloadEvents.downloadId, inserted.id),
      );
      const pauseEvent = rows.find((row) =>
        row.eventType === "download.paused"
      );
      const resumeEvent = rows.find((row) =>
        row.eventType === "download.resumed"
      );
      assertExists(pauseEvent);
      assertExists(resumeEvent);

      const pauseMetadata = pauseEvent.metadata
        ? JSON.parse(pauseEvent.metadata)
        : undefined;
      const resumeMetadata = resumeEvent.metadata
        ? JSON.parse(resumeEvent.metadata)
        : undefined;
      assertExists(pauseMetadata);
      assertExists(resumeMetadata);
      assertEquals(pauseMetadata.covered_episodes, [1, 2]);
      assertEquals(pauseMetadata.source_metadata?.indexer, "Nyaa");
      assertEquals(
        pauseMetadata.source_metadata?.source_url,
        "https://nyaa.si/view/123",
      );
      assertEquals(pauseMetadata.source_metadata?.trusted, true);
      assertEquals(resumeMetadata.covered_episodes, [1, 2]);
      assertEquals(resumeMetadata.source_metadata?.indexer, "Nyaa");
      assertEquals(
        resumeMetadata.source_metadata?.source_url,
        "https://nyaa.si/view/123",
      );
      assertEquals(resumeMetadata.source_metadata?.trusted, true);
    } finally {
      await Deno.remove(libraryDir, { recursive: true }).catch(() => undefined);
    }
  });
});

Deno.test("retryDownloadById stores structured metadata in retried events", async () => {
  await withTestDb(async (db, databaseFile) => {
    const libraryDir = await Deno.makeTempDir();

    try {
      await seedConfig(db, databaseFile, (config) => config);
      await db.insert(anime).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        bannerImage: null,
        coverImage: null,
        description: null,
        endDate: null,
        endYear: null,
        episodeCount: 12,
        format: "TV",
        genres: "[]",
        id: 1,
        malId: null,
        monitored: true,
        nextAiringAt: null,
        nextAiringEpisode: null,
        profileName: "Default",
        releaseProfileIds: encodeNumberList([]),
        rootFolder: libraryDir,
        score: null,
        startDate: "2025-01-01",
        startYear: 2025,
        status: "RELEASING",
        studios: "[]",
        titleEnglish: "Show",
        titleNative: null,
        titleRomaji: "Show",
      });

      const [inserted] = await db.insert(downloads).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        animeId: 1,
        animeTitle: "Show",
        contentPath: null,
        coveredEpisodes: encodeNumberList([3]),
        downloadDate: null,
        downloadedBytes: 0,
        episodeNumber: 3,
        errorMessage: "network error",
        etaSeconds: null,
        externalState: "error",
        groupName: "SubsPlease",
        infoHash: null,
        isBatch: false,
        lastErrorAt: "2024-01-01T00:00:00.000Z",
        lastSyncedAt: "2024-01-01T00:00:00.000Z",
        magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
        progress: 0,
        reconciledAt: null,
        retryCount: 1,
        savePath: null,
        sourceMetadata: encodeDownloadSourceMetadata({
          decision_reason: "Upgrade from 720p",
          indexer: "Nyaa",
          source_url: "https://nyaa.si/view/456",
        }),
        speedBytes: 0,
        status: "error",
        torrentName: "[SubsPlease] Show - 03",
        totalBytes: 100,
      }).returning({ id: downloads.id });

      const orchestration = await createDownloadOrchestrationForTest(db, []);

      await runTestEffect(orchestration.retryDownloadById(inserted.id));

      const [updatedRow] = await db.select().from(downloads).where(
        eq(downloads.id, inserted.id),
      );
      assertExists(updatedRow);
      assertEquals(updatedRow.status, "queued");
      assertEquals(updatedRow.retryCount, 2);

      const eventRows = await db.select().from(schema.downloadEvents).where(
        and(
          eq(schema.downloadEvents.downloadId, inserted.id),
          eq(schema.downloadEvents.eventType, "download.retried"),
        ),
      ).limit(1);
      const retriedEvent = eventRows[0];
      assertExists(retriedEvent);

      const metadata = retriedEvent.metadata
        ? JSON.parse(retriedEvent.metadata)
        : undefined;
      assertExists(metadata);
      assertEquals(metadata.covered_episodes, [3]);
      assertEquals(metadata.source_metadata?.indexer, "Nyaa");
      assertEquals(
        metadata.source_metadata?.source_url,
        "https://nyaa.si/view/456",
      );
      assertEquals(
        metadata.source_metadata?.decision_reason,
        "Upgrade from 720p",
      );
    } finally {
      await Deno.remove(libraryDir, { recursive: true }).catch(() => undefined);
    }
  });
});

Deno.test("applyDownloadActionEffect stores structured metadata on delete events", async () => {
  await withTestDb(async (db, databaseFile) => {
    const libraryDir = await Deno.makeTempDir();

    try {
      await seedConfig(db, databaseFile, (config) => config);
      await db.insert(anime).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        bannerImage: null,
        coverImage: null,
        description: null,
        endDate: null,
        endYear: null,
        episodeCount: 12,
        format: "TV",
        genres: "[]",
        id: 1,
        malId: null,
        monitored: true,
        nextAiringAt: null,
        nextAiringEpisode: null,
        profileName: "Default",
        releaseProfileIds: encodeNumberList([]),
        rootFolder: libraryDir,
        score: null,
        startDate: "2025-01-01",
        startYear: 2025,
        status: "RELEASING",
        studios: "[]",
        titleEnglish: "Show",
        titleNative: null,
        titleRomaji: "Show",
      });

      const [inserted] = await db.insert(downloads).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        animeId: 1,
        animeTitle: "Show",
        contentPath: null,
        coveredEpisodes: encodeNumberList([4, 5]),
        downloadDate: null,
        downloadedBytes: 10,
        episodeNumber: 4,
        errorMessage: null,
        etaSeconds: 0,
        externalState: "downloading",
        groupName: "SubsPlease",
        infoHash: null,
        isBatch: true,
        lastErrorAt: null,
        lastSyncedAt: "2024-01-01T00:00:00.000Z",
        magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
        progress: 20,
        reconciledAt: null,
        retryCount: 0,
        savePath: null,
        sourceMetadata: encodeDownloadSourceMetadata({
          indexer: "Nyaa",
          source_url: "https://nyaa.si/view/987",
          trusted: false,
        }),
        speedBytes: 0,
        status: "downloading",
        torrentName: "[SubsPlease] Show - 04-05",
        totalBytes: 100,
      }).returning({ id: downloads.id });

      const orchestration = await createDownloadOrchestrationForTest(db, []);

      await runTestEffect(
        orchestration.applyDownloadActionEffect(inserted.id, "delete", false),
      );

      const remainingRows = await db.select().from(downloads).where(
        eq(downloads.id, inserted.id),
      ).limit(1);
      assertEquals(remainingRows.length, 0);

      const deleteEventRows = await db.select().from(schema.downloadEvents)
        .where(
          and(
            eq(schema.downloadEvents.downloadId, inserted.id),
            eq(schema.downloadEvents.eventType, "download.deleted"),
          ),
        ).limit(1);
      const deleteEvent = deleteEventRows[0];
      assertExists(deleteEvent);
      assertEquals(deleteEvent.toStatus, "deleted");

      const metadata = deleteEvent.metadata
        ? JSON.parse(deleteEvent.metadata)
        : undefined;
      assertExists(metadata);
      assertEquals(metadata.covered_episodes, [4, 5]);
      assertEquals(metadata.source_metadata?.indexer, "Nyaa");
      assertEquals(
        metadata.source_metadata?.source_url,
        "https://nyaa.si/view/987",
      );
      assertEquals(metadata.source_metadata?.trusted, false);
    } finally {
      await Deno.remove(libraryDir, { recursive: true }).catch(() => undefined);
    }
  });
});

Deno.test("reconcileDownloadByIdEffect imports lone generic batch files using stored coverage and provenance", async () => {
  await withTestDb(async (db, databaseFile) => {
    const libraryDir = await Deno.makeTempDir();
    const downloadDir = await Deno.makeTempDir();

    try {
      await seedConfig(db, databaseFile, (config) => ({
        ...config,
        library: {
          ...config.library,
          import_mode: "copy",
          naming_format:
            "{title} - {source_episode_segment} [{quality} {resolution}]",
        },
      }));
      await db.insert(anime).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        bannerImage: null,
        coverImage: null,
        description: null,
        endDate: null,
        endYear: null,
        episodeCount: 12,
        format: "TV",
        genres: "[]",
        id: 1,
        malId: null,
        monitored: true,
        nextAiringAt: null,
        nextAiringEpisode: null,
        profileName: "Default",
        releaseProfileIds: encodeNumberList([]),
        rootFolder: libraryDir,
        score: null,
        startDate: "2025-01-01",
        startYear: 2025,
        status: "RELEASING",
        studios: "[]",
        titleEnglish: null,
        titleNative: null,
        titleRomaji: "Show",
      });
      await db.insert(episodes).values([
        {
          aired: "2025-03-14",
          animeId: 1,
          downloaded: false,
          filePath: null,
          number: 1,
          title: "Pilot",
        },
        {
          aired: "2025-03-21",
          animeId: 1,
          downloaded: false,
          filePath: null,
          number: 2,
          title: "Second",
        },
      ]);

      const sourcePath = `${downloadDir}/download.mkv`;
      await Deno.writeTextFile(sourcePath, "video");

      const [inserted] = await db.insert(downloads).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        animeId: 1,
        animeTitle: "Show",
        contentPath: downloadDir,
        coveredEpisodes: "[1,2]",
        downloadDate: "2024-01-01T00:10:00.000Z",
        downloadedBytes: 100,
        episodeNumber: 1,
        errorMessage: null,
        etaSeconds: 0,
        externalState: "completed",
        groupName: "SubsPlease",
        infoHash: "abcdef1234567890abcdef1234567890abcdef12",
        isBatch: true,
        lastErrorAt: null,
        lastSyncedAt: "2024-01-01T00:10:00.000Z",
        magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
        progress: 100,
        reconciledAt: null,
        retryCount: 0,
        savePath: downloadDir,
        sourceMetadata: encodeDownloadSourceMetadata({
          quality: "WEB-DL",
          resolution: "1080p",
          source_identity: {
            episode_numbers: [1, 2],
            label: "01-02",
            scheme: "absolute",
          },
        }),
        speedBytes: 0,
        status: "completed",
        torrentName: "[SubsPlease] Show Season Pack",
        totalBytes: 100,
      }).returning({ id: downloads.id });

      const events: NotificationEvent[] = [];
      const orchestration = await createDownloadOrchestrationForTest(
        db,
        events,
      );

      await runTestEffect(
        orchestration.reconcileDownloadByIdEffect(inserted.id),
      );

      const episodeRows = await db.select().from(episodes).where(
        eq(episodes.animeId, 1),
      ).orderBy(episodes.number);
      const updatedDownloadRows = await db.select().from(downloads).where(
        eq(downloads.id, inserted.id),
      ).limit(1);
      const expectedPath = `${libraryDir}/Show - 01-02 [WEB-DL 1080p].mkv`;

      assertEquals(
        episodeRows.map((row) => ({
          downloaded: row.downloaded,
          filePath: row.filePath,
          number: row.number,
        })),
        [
          { downloaded: true, filePath: expectedPath, number: 1 },
          { downloaded: true, filePath: expectedPath, number: 2 },
        ],
      );
      assertEquals(updatedDownloadRows[0]?.status, "imported");
      assertExists(updatedDownloadRows[0]?.reconciledAt);
      assertEquals(await Deno.readTextFile(expectedPath), "video");

      const importedBatchEvents = await db.select().from(schema.downloadEvents)
        .where(
          and(
            eq(schema.downloadEvents.downloadId, inserted.id),
            eq(schema.downloadEvents.eventType, "download.imported.batch"),
          ),
        ).limit(1);
      const importedBatchEvent = importedBatchEvents[0];
      assertExists(importedBatchEvent);
      const importedBatchMetadata = importedBatchEvent.metadata
        ? JSON.parse(importedBatchEvent.metadata)
        : undefined;
      assertExists(importedBatchMetadata);
      assertEquals(importedBatchMetadata.covered_episodes, [1, 2]);
      assertEquals(importedBatchMetadata.imported_path, libraryDir);
      assertEquals(importedBatchMetadata.source_metadata?.resolution, "1080p");
      assertEquals(importedBatchMetadata.source_metadata?.quality, "WEB-DL");
    } finally {
      await Deno.remove(libraryDir, { recursive: true }).catch(() => undefined);
      await Deno.remove(downloadDir, { recursive: true }).catch(() =>
        undefined
      );
    }
  });
});

Deno.test("syncDownloadsWithQBitEffect stores structured metadata for status and coverage events", async () => {
  await withTestDb(async (db, databaseFile) => {
    const libraryDir = await Deno.makeTempDir();

    try {
      await seedConfig(db, databaseFile, (config) => ({
        ...config,
        qbittorrent: {
          ...config.qbittorrent,
          enabled: true,
          password: "secret",
        },
      }));
      await db.insert(anime).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        bannerImage: null,
        coverImage: null,
        description: null,
        endDate: null,
        endYear: null,
        episodeCount: 12,
        format: "TV",
        genres: "[]",
        id: 1,
        malId: null,
        monitored: true,
        nextAiringAt: null,
        nextAiringEpisode: null,
        profileName: "Default",
        releaseProfileIds: encodeNumberList([]),
        rootFolder: libraryDir,
        score: null,
        startDate: "2025-01-01",
        startYear: 2025,
        status: "RELEASING",
        studios: "[]",
        titleEnglish: "Show",
        titleNative: null,
        titleRomaji: "Show",
      });

      const infoHash = "abcdef1234567890abcdef1234567890abcdef12";
      const [inserted] = await db.insert(downloads).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        animeId: 1,
        animeTitle: "Show",
        contentPath: null,
        coveredEpisodes: encodeNumberList([1]),
        downloadDate: null,
        downloadedBytes: 10,
        episodeNumber: 1,
        errorMessage: null,
        etaSeconds: 0,
        externalState: "queued",
        groupName: "SubsPlease",
        infoHash,
        isBatch: true,
        lastErrorAt: null,
        lastSyncedAt: "2024-01-01T00:00:00.000Z",
        magnet: `magnet:?xt=urn:btih:${infoHash}`,
        progress: 5,
        reconciledAt: null,
        retryCount: 0,
        savePath: null,
        sourceMetadata: encodeDownloadSourceMetadata({
          indexer: "Nyaa",
          source_url: "https://nyaa.si/view/789",
          trusted: true,
        }),
        speedBytes: 0,
        status: "queued",
        torrentName: "[SubsPlease] Show Batch",
        totalBytes: 100,
      }).returning({ id: downloads.id });

      const orchestration = makeDownloadOrchestration({
        db,
        dbError,
        eventBus: {
          publish: () => Effect.void,
        } as unknown as typeof EventBus.Service,
        fs: makeRealFileSystem(),
        mediaProbe: {
          probeVideoFile: () => Effect.sync(() => undefined),
        },
        maybeQBitConfig,
        qbitClient: {
          addTorrentUrl: () => Effect.void,
          deleteTorrent: () => Effect.void,
          listTorrentContents: () =>
            Effect.succeed([
              {
                is_seed: false,
                name: "Show - 01-02.mkv",
                priority: 1,
                progress: 1,
                size: 100,
              },
            ]),
          listTorrents: () =>
            Effect.succeed([
              {
                content_path: "/downloads/Show - 01-02.mkv",
                downloaded: 100,
                dlspeed: 0,
                eta: 0,
                hash: infoHash,
                name: "[SubsPlease] Show Batch",
                progress: 1,
                save_path: "/downloads",
                size: 100,
                state: "pausedDL",
              },
            ]),
          pauseTorrent: () => Effect.void,
          resumeTorrent: () => Effect.void,
        } as unknown as typeof QBitTorrentClient.Service,
        triggerSemaphore: await runTestEffect(Effect.makeSemaphore(1)),
        tryDatabasePromise,
        tryOperationsPromise,
        wrapOperationsError,
      });

      await runTestEffect(orchestration.syncDownloadsWithQBitEffect());

      const updated = await db.select().from(downloads).where(
        eq(downloads.id, inserted.id),
      ).limit(1);
      assertEquals(updated[0]?.status, "paused");
      assertEquals(updated[0]?.coveredEpisodes, "[1,2]");

      const statusEvents = await db.select().from(schema.downloadEvents).where(
        and(
          eq(schema.downloadEvents.downloadId, inserted.id),
          eq(schema.downloadEvents.eventType, "download.status_changed"),
        ),
      ).limit(1);
      const coverageEvents = await db.select().from(schema.downloadEvents)
        .where(
          and(
            eq(schema.downloadEvents.downloadId, inserted.id),
            eq(schema.downloadEvents.eventType, "download.coverage_refined"),
          ),
        ).limit(1);

      const statusEvent = statusEvents[0];
      const coverageEvent = coverageEvents[0];
      assertExists(statusEvent);
      assertExists(coverageEvent);

      const statusMetadata = statusEvent.metadata
        ? JSON.parse(statusEvent.metadata)
        : undefined;
      const coverageMetadata = coverageEvent.metadata
        ? JSON.parse(coverageEvent.metadata)
        : undefined;
      assertExists(statusMetadata);
      assertExists(coverageMetadata);

      assertEquals(statusMetadata.covered_episodes, [1]);
      assertEquals(statusMetadata.source_metadata?.indexer, "Nyaa");
      assertEquals(
        statusMetadata.source_metadata?.source_url,
        "https://nyaa.si/view/789",
      );
      assertEquals(statusMetadata.source_metadata?.trusted, true);
      assertEquals(coverageMetadata.covered_episodes, [1, 2]);
      assertEquals(coverageMetadata.source_metadata?.indexer, "Nyaa");
      assertEquals(
        coverageMetadata.source_metadata?.source_url,
        "https://nyaa.si/view/789",
      );
      assertEquals(coverageMetadata.source_metadata?.trusted, true);
    } finally {
      await Deno.remove(libraryDir, { recursive: true }).catch(() => undefined);
    }
  });
});

Deno.test("loadDownloadPresentationContexts falls back to reconciled download path when no episode row is mapped", async () => {
  await withTestDb(async (db, databaseFile) => {
    const libraryDir = await Deno.makeTempDir();

    try {
      await seedConfig(db, databaseFile, (config) => config);
      await db.insert(anime).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        bannerImage: null,
        coverImage: "https://example.com/show.jpg",
        description: null,
        endDate: null,
        endYear: null,
        episodeCount: 12,
        format: "TV",
        genres: "[]",
        id: 1,
        malId: null,
        monitored: true,
        nextAiringAt: null,
        nextAiringEpisode: null,
        profileName: "Default",
        releaseProfileIds: encodeNumberList([]),
        rootFolder: libraryDir,
        score: null,
        startDate: "2025-01-01",
        startYear: 2025,
        status: "RELEASING",
        studios: "[]",
        titleEnglish: null,
        titleNative: null,
        titleRomaji: "Show",
      });

      const [row] = await db.insert(downloads).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        animeId: 1,
        animeTitle: "Show",
        contentPath: `${libraryDir}/Show - 01.mkv`,
        coveredEpisodes: "[1]",
        downloadDate: null,
        downloadedBytes: 100,
        episodeNumber: 1,
        errorMessage: null,
        etaSeconds: 0,
        externalState: "imported",
        groupName: null,
        infoHash: null,
        isBatch: false,
        lastErrorAt: null,
        lastSyncedAt: null,
        magnet: null,
        progress: 100,
        reconciledAt: "2024-01-01T00:10:00.000Z",
        retryCount: 0,
        savePath: libraryDir,
        sourceMetadata: null,
        speedBytes: 0,
        status: "imported",
        torrentName: "Show - 01",
        totalBytes: 100,
      }).returning();

      const contexts = await loadDownloadPresentationContexts(db, [row]);

      assertEquals(contexts.get(row.id), {
        animeImage: "https://example.com/show.jpg",
        importedPath: `${libraryDir}/Show - 01.mkv`,
      });
    } finally {
      await Deno.remove(libraryDir, { recursive: true }).catch(() => undefined);
    }
  });
});

Deno.test("reconcileDownloadByIdEffect imports generic completed files using stored provenance", async () => {
  await withTestDb(async (db, databaseFile) => {
    const libraryDir = await Deno.makeTempDir();
    const downloadDir = await Deno.makeTempDir();

    try {
      await seedConfig(db, databaseFile, (config) => ({
        ...config,
        library: {
          ...config.library,
          import_mode: "copy",
          naming_format:
            "{title} - {source_episode_segment} [{quality} {resolution}]",
        },
      }));
      await db.insert(anime).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        bannerImage: null,
        coverImage: null,
        description: null,
        endDate: null,
        endYear: null,
        episodeCount: 12,
        format: "TV",
        genres: "[]",
        id: 1,
        malId: null,
        monitored: true,
        nextAiringAt: null,
        nextAiringEpisode: null,
        profileName: "Default",
        releaseProfileIds: encodeNumberList([]),
        rootFolder: libraryDir,
        score: null,
        startDate: "2025-01-01",
        startYear: 2025,
        status: "RELEASING",
        studios: "[]",
        titleEnglish: null,
        titleNative: null,
        titleRomaji: "Show",
      });
      await db.insert(episodes).values({
        aired: "2025-03-14",
        animeId: 1,
        downloaded: false,
        filePath: null,
        number: 1,
        title: "Pilot",
      });

      const sourcePath = `${downloadDir}/download.mkv`;
      await Deno.writeTextFile(sourcePath, "video");

      const [inserted] = await db.insert(downloads).values({
        addedAt: "2024-01-01T00:00:00.000Z",
        animeId: 1,
        animeTitle: "Show",
        contentPath: downloadDir,
        coveredEpisodes: "[1]",
        downloadDate: "2024-01-01T00:10:00.000Z",
        downloadedBytes: 100,
        episodeNumber: 1,
        errorMessage: null,
        etaSeconds: 0,
        externalState: "completed",
        groupName: "SubsPlease",
        infoHash: "abcdef1234567890abcdef1234567890abcdef12",
        isBatch: false,
        lastErrorAt: null,
        lastSyncedAt: "2024-01-01T00:10:00.000Z",
        magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
        progress: 100,
        reconciledAt: null,
        retryCount: 0,
        savePath: downloadDir,
        sourceMetadata: encodeDownloadSourceMetadata({
          quality: "WEB-DL",
          resolution: "1080p",
          source_identity: {
            episode_numbers: [1],
            label: "01",
            scheme: "absolute",
          },
        }),
        speedBytes: 0,
        status: "completed",
        torrentName: "[SubsPlease] Show - 01 (1080p)",
        totalBytes: 100,
      }).returning({ id: downloads.id });

      const events: NotificationEvent[] = [];
      const orchestration = await createDownloadOrchestrationForTest(
        db,
        events,
      );

      await runTestEffect(
        orchestration.reconcileDownloadByIdEffect(inserted.id),
      );

      const episodeRows = await db.select().from(episodes).where(
        and(eq(episodes.animeId, 1), eq(episodes.number, 1)),
      ).limit(1);
      const updatedDownloadRows = await db.select().from(downloads).where(
        eq(downloads.id, inserted.id),
      ).limit(1);
      const expectedPath = `${libraryDir}/Show - 01 [WEB-DL 1080p].mkv`;

      assertEquals(episodeRows[0]?.downloaded, true);
      assertEquals(episodeRows[0]?.filePath, expectedPath);
      assertEquals(updatedDownloadRows[0]?.status, "imported");
      assertExists(updatedDownloadRows[0]?.reconciledAt);
      assertEquals(await Deno.readTextFile(expectedPath), "video");
      assertEquals(await Deno.readTextFile(sourcePath), "video");

      const importedEvents = await db.select().from(schema.downloadEvents)
        .where(
          and(
            eq(schema.downloadEvents.downloadId, inserted.id),
            eq(schema.downloadEvents.eventType, "download.imported"),
          ),
        ).limit(1);
      const importedEvent = importedEvents[0];
      assertExists(importedEvent);
      const importedMetadata = importedEvent.metadata
        ? JSON.parse(importedEvent.metadata)
        : undefined;
      assertExists(importedMetadata);
      assertEquals(importedMetadata.covered_episodes, [1]);
      assertEquals(importedMetadata.imported_path, expectedPath);
      assertEquals(importedMetadata.source_metadata?.resolution, "1080p");
      assertEquals(importedMetadata.source_metadata?.quality, "WEB-DL");

      const finishedEvent = events.at(-1);
      assertEquals(finishedEvent?.type, "DownloadFinished");
      if (finishedEvent?.type === "DownloadFinished") {
        assertEquals(finishedEvent.payload.imported_path, expectedPath);
        assertEquals(finishedEvent.payload.source_metadata?.quality, "WEB-DL");
      }
    } finally {
      await Deno.remove(libraryDir, { recursive: true }).catch(() => undefined);
      await Deno.remove(downloadDir, { recursive: true }).catch(() =>
        undefined
      );
    }
  });
});

async function createDownloadOrchestrationForTest(
  db: AppDatabase,
  events: NotificationEvent[],
) {
  return makeDownloadOrchestration({
    db,
    dbError,
    eventBus: {
      publish: (event: NotificationEvent) =>
        Effect.sync(() => {
          events.push(event);
        }),
    } as unknown as typeof EventBus.Service,
    fs: makeRealFileSystem(),
    mediaProbe: {
      probeVideoFile: () => Effect.sync(() => undefined),
    },
    maybeQBitConfig,
    qbitClient: {
      addTorrentUrl: () => Effect.void,
      deleteTorrent: () => Effect.void,
      listTorrentContents: () => Effect.succeed([]),
      listTorrents: () => Effect.succeed([]),
      pauseTorrent: () => Effect.void,
      resumeTorrent: () => Effect.void,
    } as unknown as typeof QBitTorrentClient.Service,
    triggerSemaphore: await runTestEffect(Effect.makeSemaphore(1)),
    tryDatabasePromise,
    tryOperationsPromise,
    wrapOperationsError,
  });
}

function makeRealFileSystem(): FileSystemShape {
  const wrap = <A>(
    path: string | URL,
    message: string,
    operation: () => Promise<A>,
  ) =>
    Effect.tryPromise({
      try: operation,
      catch: (cause) =>
        new FileSystemError({ cause, message, path: toPathString(path) }),
    });

  return {
    copyFile: (from, to) =>
      wrap(from, "Failed to copy file", () => Deno.copyFile(from, to)),
    mkdir: (path, options) =>
      wrap(path, "Failed to create directory", () => Deno.mkdir(path, options)),
    openFile: (path, options) =>
      Effect.acquireRelease(
        wrap(path, "Failed to open file", () => Deno.open(path, options)),
        (file) => Effect.sync(() => file.close()),
      ),
    readDir: (path) =>
      wrap(
        path,
        "Failed to read directory",
        () => Array.fromAsync(Deno.readDir(path)),
      ),
    readFile: (path) =>
      wrap(path, "Failed to read file", () => Deno.readFile(path)),
    realPath: (path) =>
      wrap(path, "Failed to resolve path", () => Deno.realPath(path)),
    remove: (path, options) =>
      wrap(path, "Failed to remove", () => Deno.remove(path, options)),
    rename: (from, to) =>
      wrap(from, "Failed to rename", () => Deno.rename(from, to)),
    stat: (path) => wrap(path, "Failed to stat path", () => Deno.stat(path)),
    writeFile: (path, data) =>
      wrap(path, "Failed to write file", () => Deno.writeFile(path, data)),
  };
}

async function seedConfig(
  db: AppDatabase,
  databaseFile: string,
  mutate: (
    config: ReturnType<typeof makeDefaultConfig>,
  ) => ReturnType<typeof makeDefaultConfig>,
) {
  const config = mutate(makeDefaultConfig(databaseFile));
  await db.insert(appConfig).values({
    data: encodeConfigCore(config),
    id: 1,
    updatedAt: "2024-01-01T00:00:00.000Z",
  });
}

function toPathString(path: string | URL) {
  return typeof path === "string" ? path : path.toString();
}

async function withTestDb(
  run: (db: AppDatabase, databaseFile: string) => Promise<void>,
) {
  const databaseFile = await Deno.makeTempFile({ suffix: ".sqlite" });
  const client = createClient({ url: `file:${databaseFile}` });
  const db = drizzle({ client, schema });

  try {
    await migrate(db, { migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER });
    await run(db, databaseFile);
  } finally {
    client.close();
    await Deno.remove(databaseFile).catch(() => undefined);
  }
}
