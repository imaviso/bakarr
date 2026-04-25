import { assert, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";

import { downloadEvents, downloads, rssFeeds } from "@/db/schema.ts";
import { toDownload, toDownloadStatus } from "@/features/operations/download-presentation.ts";
import {
  encodeDownloadEventMetadata,
  encodeDownloadSourceMetadata,
} from "@/features/operations/repository/download-repository.ts";
import { toDownloadEvent } from "@/domain/download/event-presentations.ts";
import { toRssFeed } from "@/features/operations/repository/rss-repository.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";

it.effect("repository mappers convert RSS feed and download event rows", () =>
  Effect.gen(function* () {
    const feed = toRssFeed({
      animeId: 20,
      createdAt: "2024-01-01T00:00:00.000Z",
      enabled: true,
      id: 3,
      lastChecked: null,
      name: null,
      url: "https://example.com/feed.xml",
    } satisfies typeof rssFeeds.$inferSelect);

    assert.deepStrictEqual(feed, {
      anime_id: 20,
      created_at: "2024-01-01T00:00:00.000Z",
      enabled: true,
      id: 3,
      last_checked: undefined,
      name: undefined,
      url: "https://example.com/feed.xml",
    });

    const event = yield* toDownloadEvent(
      {
        animeId: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        downloadId: 4,
        eventType: "download.started",
        fromStatus: null,
        id: 8,
        message: "Started Naruto - 01",
        metadata: yield* encodeDownloadEventMetadata({
          covered_episodes: [1],
          imported_path: "/library/Naruto/Naruto - 01.mkv",
          source_metadata: {
            group: "SubsPlease",
            indexer: "Nyaa",
            quality: "WEB-DL 1080p",
          },
        }),
        toStatus: "downloading",
      } satisfies typeof downloadEvents.$inferSelect,
      {
        animeImage: "https://example.com/naruto.jpg",
        animeTitle: "Naruto",
        torrentName: "Naruto - 01",
      },
    );

    assert.deepStrictEqual(event, {
      anime_id: undefined,
      anime_image: "https://example.com/naruto.jpg",
      anime_title: "Naruto",
      created_at: "2024-01-01T00:00:00.000Z",
      download_id: 4,
      event_type: "download.started",
      from_status: undefined,
      id: 8,
      message: "Started Naruto - 01",
      metadata: yield* encodeDownloadEventMetadata({
        covered_episodes: [1],
        imported_path: "/library/Naruto/Naruto - 01.mkv",
        source_metadata: {
          group: "SubsPlease",
          indexer: "Nyaa",
          quality: "WEB-DL 1080p",
        },
      }),
      metadata_json: {
        covered_episodes: [1],
        imported_path: "/library/Naruto/Naruto - 01.mkv",
        source_metadata: {
          group: "SubsPlease",
          indexer: "Nyaa",
          quality: "WEB-DL 1080p",
        },
      },
      torrent_name: "Naruto - 01",
      to_status: "downloading",
    });
  }),
);

it.effect("toDownloadEvent decodes covered_episodes and source_metadata for lifecycle events", () =>
  Effect.gen(function* () {
    const pauseEvent = yield* toDownloadEvent({
      animeId: 42,
      createdAt: "2024-02-01T12:00:00.000Z",
      downloadId: 7,
      eventType: "download.paused",
      fromStatus: "downloading",
      id: 10,
      message: "Paused [SubsPlease] Naruto - 02",
      metadata: yield* encodeDownloadEventMetadata({
        covered_episodes: [2],
        source_metadata: {
          indexer: "Nyaa",
          resolution: "720p",
          source_url: "https://nyaa.si/view/555",
          trusted: true,
        },
      }),
      toStatus: "paused",
    } satisfies typeof downloadEvents.$inferSelect);

    assert.deepStrictEqual(pauseEvent.anime_id, 42);
    assert.deepStrictEqual(pauseEvent.download_id, 7);
    assert.deepStrictEqual(pauseEvent.event_type, "download.paused");
    assert.deepStrictEqual(pauseEvent.from_status, "downloading");
    assert.deepStrictEqual(pauseEvent.to_status, "paused");
    assert.deepStrictEqual(pauseEvent.metadata_json?.covered_episodes, [2]);
    assert.deepStrictEqual(pauseEvent.metadata_json?.source_metadata?.indexer, "Nyaa");
    assert.deepStrictEqual(pauseEvent.metadata_json?.source_metadata?.resolution, "720p");
    assert.deepStrictEqual(
      pauseEvent.metadata_json?.source_metadata?.source_url,
      "https://nyaa.si/view/555",
    );
    assert.deepStrictEqual(pauseEvent.metadata_json?.source_metadata?.trusted, true);

    const statusChangeEvent = yield* toDownloadEvent({
      animeId: 99,
      createdAt: "2024-03-01T08:30:00.000Z",
      downloadId: 12,
      eventType: "download.status_changed",
      fromStatus: "queued",
      id: 15,
      message: "[Group] Anime - 05 moved to downloading",
      metadata: yield* encodeDownloadEventMetadata({
        covered_episodes: [5, 6],
        source_metadata: {
          decision_reason: "Upgrade from 480p",
          indexer: "Nyaa",
        },
      }),
      toStatus: "downloading",
    } satisfies typeof downloadEvents.$inferSelect);

    assert.deepStrictEqual(statusChangeEvent.metadata_json?.covered_episodes, [5, 6]);
    assert.deepStrictEqual(
      statusChangeEvent.metadata_json?.source_metadata?.decision_reason,
      "Upgrade from 480p",
    );
    assert.deepStrictEqual(statusChangeEvent.metadata_json?.source_metadata?.indexer, "Nyaa");
  }),
);

it.effect("repository download mappers decode optional fields and derive status metrics", () =>
  Effect.gen(function* () {
    const row = {
      addedAt: "2024-01-01T00:00:00.000Z",
      animeId: 20,
      animeTitle: "Naruto",
      contentPath: "/downloads/Naruto - 01.mkv",
      coveredEpisodes: "[1,2]",
      downloadDate: "2024-01-01T00:05:00.000Z",
      downloadedBytes: 500,
      episodeNumber: 1,
      errorMessage: null,
      etaSeconds: null,
      externalState: "downloading",
      groupName: "SubsPlease",
      id: 1,
      infoHash: "generated-hash",
      isBatch: true,
      lastErrorAt: null,
      lastSyncedAt: "2024-01-01T00:06:00.000Z",
      magnet: "magnet:?xt=urn:btih:test",
      progress: 25,
      reconciledAt: null,
      retryCount: 2,
      savePath: "/downloads",
      speedBytes: null,
      sourceMetadata: yield* encodeDownloadSourceMetadata({
        chosen_from_seadex: true,
        decision_reason: "Accepted (WEB-DL 1080p, score 12)",
        group: "SubsPlease",
        parsed_title: "[SubsPlease] Naruto - 01 (1080p)",
        previous_quality: "WEB-DL 720p",
        previous_score: 7,
        resolution: "1080p",
        selection_kind: "upgrade",
        selection_score: 12,
      }),
      status: "queued",
      torrentName: "Naruto - 01",
      totalBytes: 1000,
    } satisfies typeof downloads.$inferSelect;

    const download = yield* toDownload(row, {
      animeImage: "https://example.com/naruto.jpg",
      importedPath: "/library/Naruto/Naruto - 01.mkv",
    });
    assert.deepStrictEqual(download.covered_episodes, [1, 2]);
    assert.deepStrictEqual(download.anime_image, "https://example.com/naruto.jpg");
    assert.deepStrictEqual(download.content_path, "/downloads/Naruto - 01.mkv");
    assert.deepStrictEqual(download.decision_reason, "Accepted (WEB-DL 1080p, score 12)");
    assert.deepStrictEqual(download.group_name, "SubsPlease");
    assert.deepStrictEqual(download.imported_path, "/library/Naruto/Naruto - 01.mkv");
    assert.deepStrictEqual(download.retry_count, 2);
    assert.deepStrictEqual(download.source_metadata?.chosen_from_seadex, true);
    assert.deepStrictEqual(download.source_metadata?.previous_quality, "WEB-DL 720p");
    assert.deepStrictEqual(download.source_metadata?.previous_score, 7);
    assert.deepStrictEqual(download.source_metadata?.resolution, "1080p");
    assert.deepStrictEqual(download.source_metadata?.selection_kind, "upgrade");
    assert.deepStrictEqual(download.source_metadata?.selection_score, 12);

    const queuedStatus = yield* toDownloadStatus(row, {
      animeImage: "https://example.com/naruto.jpg",
      importedPath: "/library/Naruto/Naruto - 01.mkv",
    });
    assert.deepStrictEqual(queuedStatus.anime_id, 20);
    assert.deepStrictEqual(queuedStatus.anime_image, "https://example.com/naruto.jpg");
    assert.deepStrictEqual(queuedStatus.anime_title, "Naruto");
    assert.deepStrictEqual(queuedStatus.decision_reason, "Accepted (WEB-DL 1080p, score 12)");
    assert.deepStrictEqual(queuedStatus.hash, "generated-hash");
    assert.deepStrictEqual(queuedStatus.imported_path, "/library/Naruto/Naruto - 01.mkv");
    assert.deepStrictEqual(queuedStatus.progress, 0.25);
    assert.deepStrictEqual(queuedStatus.eta, 0);
    assert.deepStrictEqual(queuedStatus.speed, 0);
    assert.deepStrictEqual(queuedStatus.source_metadata?.chosen_from_seadex, true);
    assert.deepStrictEqual(queuedStatus.source_metadata?.group, "SubsPlease");
    assert.deepStrictEqual(queuedStatus.source_metadata?.selection_kind, "upgrade");

    const activeStatus = yield* toDownloadStatus(
      {
        ...row,
        infoHash: "abcdef",
        progress: 80,
        speedBytes: null,
        status: "downloading",
      },
      {
        animeImage: "https://example.com/naruto.jpg",
      },
    );
    assert.deepStrictEqual(activeStatus.hash, "abcdef");
    assert.deepStrictEqual(activeStatus.anime_image, "https://example.com/naruto.jpg");
    assert.deepStrictEqual(activeStatus.covered_episodes, [1, 2]);
    assert.deepStrictEqual(activeStatus.coverage_pending, undefined);
    assert.deepStrictEqual(activeStatus.episode_number, 1);
    assert.deepStrictEqual(activeStatus.is_batch, true);
    assert.deepStrictEqual(activeStatus.progress, 0.8);
    assert.deepStrictEqual(activeStatus.speed, 0);
  }),
);

it.effect("repository download mappers flag unresolved batch coverage", () =>
  Effect.gen(function* () {
    const row = {
      addedAt: "2024-01-01T00:00:00.000Z",
      animeId: 20,
      animeTitle: "Chainsaw Man",
      contentPath: null,
      coveredEpisodes: null,
      downloadDate: null,
      downloadedBytes: 0,
      episodeNumber: 1,
      errorMessage: null,
      etaSeconds: null,
      externalState: "queued",
      groupName: null,
      id: 2,
      infoHash: "abcdef",
      isBatch: true,
      lastErrorAt: null,
      lastSyncedAt: null,
      magnet: "magnet:?xt=urn:btih:abcdef",
      progress: 0,
      reconciledAt: null,
      retryCount: 0,
      savePath: null,
      speedBytes: 0,
      sourceMetadata: null,
      status: "queued",
      torrentName: "Chainsaw Man S01",
      totalBytes: 0,
    } satisfies typeof downloads.$inferSelect;

    const download = yield* toDownload(row, {});
    const status = yield* toDownloadStatus(row, {});

    assert.deepStrictEqual(download.coverage_pending, true);
    assert.deepStrictEqual(download.covered_episodes, undefined);
    assert.deepStrictEqual(download.source_metadata, undefined);
    assert.deepStrictEqual(status.coverage_pending, true);
    assert.deepStrictEqual(status.covered_episodes, undefined);
    assert.deepStrictEqual(status.source_metadata, undefined);
  }),
);

it.effect("toDownloadStatus fails when stored infoHash is missing", () =>
  Effect.gen(function* () {
    const row = {
      addedAt: "2024-01-01T00:00:00.000Z",
      animeId: 20,
      animeTitle: "Broken Download",
      contentPath: null,
      coveredEpisodes: null,
      downloadDate: null,
      downloadedBytes: 0,
      episodeNumber: 1,
      errorMessage: null,
      etaSeconds: null,
      externalState: "queued",
      groupName: null,
      id: 99,
      infoHash: null,
      isBatch: false,
      lastErrorAt: null,
      lastSyncedAt: null,
      magnet: null,
      progress: 0,
      reconciledAt: null,
      retryCount: 0,
      savePath: null,
      speedBytes: 0,
      sourceMetadata: null,
      status: "queued",
      torrentName: "Broken Download - 01",
      totalBytes: 0,
    } satisfies typeof downloads.$inferSelect;

    const exit = yield* Effect.exit(toDownloadStatus(row, {}));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value instanceof OperationsStoredDataError, true);
      }
    }
  }),
);
