import { assertEquals } from "@std/assert";

import { downloadEvents, downloads, rssFeeds } from "../../db/schema.ts";
import {
  toDownload,
  toDownloadEvent,
  toDownloadStatus,
  toRssFeed,
} from "./repository.ts";

Deno.test("repository mappers convert RSS feed and download event rows", () => {
  const feed = toRssFeed(
    {
      animeId: 20,
      createdAt: "2024-01-01T00:00:00.000Z",
      enabled: true,
      id: 3,
      lastChecked: null,
      name: null,
      url: "https://example.com/feed.xml",
    } satisfies typeof rssFeeds.$inferSelect,
  );

  assertEquals(feed, {
    anime_id: 20,
    created_at: "2024-01-01T00:00:00.000Z",
    enabled: true,
    id: 3,
    last_checked: undefined,
    name: undefined,
    url: "https://example.com/feed.xml",
  });

  const event = toDownloadEvent(
    {
      animeId: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      downloadId: 4,
      eventType: "download.started",
      fromStatus: null,
      id: 8,
      message: "Started Naruto - 01",
      metadata: JSON.stringify({
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

  assertEquals(event, {
    anime_id: undefined,
    anime_image: "https://example.com/naruto.jpg",
    anime_title: "Naruto",
    created_at: "2024-01-01T00:00:00.000Z",
    download_id: 4,
    event_type: "download.started",
    from_status: undefined,
    id: 8,
    message: "Started Naruto - 01",
    metadata: JSON.stringify({
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
});

Deno.test("toDownloadEvent decodes covered_episodes and source_metadata for lifecycle events", () => {
  const pauseEvent = toDownloadEvent(
    {
      animeId: 42,
      createdAt: "2024-02-01T12:00:00.000Z",
      downloadId: 7,
      eventType: "download.paused",
      fromStatus: "downloading",
      id: 10,
      message: "Paused [SubsPlease] Naruto - 02",
      metadata: JSON.stringify({
        covered_episodes: [2],
        source_metadata: {
          indexer: "Nyaa",
          resolution: "720p",
          source_url: "https://nyaa.si/view/555",
          trusted: true,
        },
      }),
      toStatus: "paused",
    } satisfies typeof downloadEvents.$inferSelect,
  );

  assertEquals(pauseEvent.anime_id, 42);
  assertEquals(pauseEvent.download_id, 7);
  assertEquals(pauseEvent.event_type, "download.paused");
  assertEquals(pauseEvent.from_status, "downloading");
  assertEquals(pauseEvent.to_status, "paused");
  assertEquals(pauseEvent.metadata_json?.covered_episodes, [2]);
  assertEquals(pauseEvent.metadata_json?.source_metadata?.indexer, "Nyaa");
  assertEquals(pauseEvent.metadata_json?.source_metadata?.resolution, "720p");
  assertEquals(
    pauseEvent.metadata_json?.source_metadata?.source_url,
    "https://nyaa.si/view/555",
  );
  assertEquals(pauseEvent.metadata_json?.source_metadata?.trusted, true);

  const statusChangeEvent = toDownloadEvent(
    {
      animeId: 99,
      createdAt: "2024-03-01T08:30:00.000Z",
      downloadId: 12,
      eventType: "download.status_changed",
      fromStatus: "queued",
      id: 15,
      message: "[Group] Anime - 05 moved to downloading",
      metadata: JSON.stringify({
        covered_episodes: [5, 6],
        source_metadata: {
          decision_reason: "Upgrade from 480p",
          indexer: "Nyaa",
        },
      }),
      toStatus: "downloading",
    } satisfies typeof downloadEvents.$inferSelect,
  );

  assertEquals(statusChangeEvent.metadata_json?.covered_episodes, [5, 6]);
  assertEquals(
    statusChangeEvent.metadata_json?.source_metadata?.decision_reason,
    "Upgrade from 480p",
  );
  assertEquals(
    statusChangeEvent.metadata_json?.source_metadata?.indexer,
    "Nyaa",
  );
});

Deno.test("repository download mappers decode optional fields and derive status metrics", () => {
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
    infoHash: null,
    isBatch: true,
    lastErrorAt: null,
    lastSyncedAt: "2024-01-01T00:06:00.000Z",
    magnet: "magnet:?xt=urn:btih:test",
    progress: 25,
    reconciledAt: null,
    retryCount: 2,
    savePath: "/downloads",
    speedBytes: null,
    sourceMetadata: JSON.stringify({
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

  const download = toDownload(row, {
    animeImage: "https://example.com/naruto.jpg",
    importedPath: "/library/Naruto/Naruto - 01.mkv",
  });
  assertEquals(download.covered_episodes, [1, 2]);
  assertEquals(download.anime_image, "https://example.com/naruto.jpg");
  assertEquals(download.content_path, "/downloads/Naruto - 01.mkv");
  assertEquals(download.decision_reason, "Accepted (WEB-DL 1080p, score 12)");
  assertEquals(download.group_name, "SubsPlease");
  assertEquals(download.imported_path, "/library/Naruto/Naruto - 01.mkv");
  assertEquals(download.retry_count, 2);
  assertEquals(download.source_metadata?.chosen_from_seadex, true);
  assertEquals(download.source_metadata?.previous_quality, "WEB-DL 720p");
  assertEquals(download.source_metadata?.previous_score, 7);
  assertEquals(download.source_metadata?.resolution, "1080p");
  assertEquals(download.source_metadata?.selection_kind, "upgrade");
  assertEquals(download.source_metadata?.selection_score, 12);

  const queuedStatus = toDownloadStatus(row, () => "generated-hash", {
    animeImage: "https://example.com/naruto.jpg",
    importedPath: "/library/Naruto/Naruto - 01.mkv",
  });
  assertEquals(queuedStatus.anime_id, 20);
  assertEquals(queuedStatus.anime_image, "https://example.com/naruto.jpg");
  assertEquals(queuedStatus.anime_title, "Naruto");
  assertEquals(
    queuedStatus.decision_reason,
    "Accepted (WEB-DL 1080p, score 12)",
  );
  assertEquals(queuedStatus.hash, "generated-hash");
  assertEquals(queuedStatus.imported_path, "/library/Naruto/Naruto - 01.mkv");
  assertEquals(queuedStatus.progress, 0.25);
  assertEquals(queuedStatus.eta, 8640000);
  assertEquals(queuedStatus.speed, 0);
  assertEquals(queuedStatus.source_metadata?.chosen_from_seadex, true);
  assertEquals(queuedStatus.source_metadata?.group, "SubsPlease");
  assertEquals(queuedStatus.source_metadata?.selection_kind, "upgrade");

  const activeStatus = toDownloadStatus(
    {
      ...row,
      infoHash: "abcdef",
      progress: 80,
      speedBytes: null,
      status: "downloading",
    },
    () => "unused",
    {
      animeImage: "https://example.com/naruto.jpg",
    },
  );
  assertEquals(activeStatus.hash, "abcdef");
  assertEquals(activeStatus.anime_image, "https://example.com/naruto.jpg");
  assertEquals(activeStatus.covered_episodes, [1, 2]);
  assertEquals(activeStatus.coverage_pending, undefined);
  assertEquals(activeStatus.episode_number, 1);
  assertEquals(activeStatus.is_batch, true);
  assertEquals(activeStatus.progress, 0.8);
  assertEquals(activeStatus.speed, 1024 * 1024);
});

Deno.test("repository download mappers flag unresolved batch coverage", () => {
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

  const download = toDownload(row, {});
  const status = toDownloadStatus(row, () => "abcdef", {});

  assertEquals(download.coverage_pending, true);
  assertEquals(download.covered_episodes, undefined);
  assertEquals(download.source_metadata, undefined);
  assertEquals(status.coverage_pending, true);
  assertEquals(status.covered_episodes, undefined);
  assertEquals(status.source_metadata, undefined);
});
