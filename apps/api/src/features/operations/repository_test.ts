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
      metadata: null,
      toStatus: "downloading",
    } satisfies typeof downloadEvents.$inferSelect,
  );

  assertEquals(event, {
    anime_id: undefined,
    created_at: "2024-01-01T00:00:00.000Z",
    download_id: 4,
    event_type: "download.started",
    from_status: undefined,
    id: 8,
    message: "Started Naruto - 01",
    metadata: undefined,
    to_status: "downloading",
  });
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
    status: "queued",
    torrentName: "Naruto - 01",
    totalBytes: 1000,
  } satisfies typeof downloads.$inferSelect;

  const download = toDownload(row);
  assertEquals(download.covered_episodes, [1, 2]);
  assertEquals(download.content_path, "/downloads/Naruto - 01.mkv");
  assertEquals(download.group_name, "SubsPlease");
  assertEquals(download.retry_count, 2);

  const queuedStatus = toDownloadStatus(row, () => "generated-hash");
  assertEquals(queuedStatus.hash, "generated-hash");
  assertEquals(queuedStatus.progress, 0.25);
  assertEquals(queuedStatus.eta, 8640000);
  assertEquals(queuedStatus.speed, 0);

  const activeStatus = toDownloadStatus({
    ...row,
    infoHash: "abcdef",
    progress: 80,
    speedBytes: null,
    status: "downloading",
  }, () => "unused");
  assertEquals(activeStatus.hash, "abcdef");
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
    status: "queued",
    torrentName: "Chainsaw Man S01",
    totalBytes: 0,
  } satisfies typeof downloads.$inferSelect;

  const download = toDownload(row);
  const status = toDownloadStatus(row, () => "abcdef");

  assertEquals(download.coverage_pending, true);
  assertEquals(download.covered_episodes, undefined);
  assertEquals(status.coverage_pending, true);
  assertEquals(status.covered_episodes, undefined);
});
