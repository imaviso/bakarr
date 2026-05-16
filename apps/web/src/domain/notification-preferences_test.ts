import { brandAnimeId, type NotificationEvent } from "@bakarr/shared";
import { describe, expect, it } from "vitest";
import { getNotificationPreferenceKeyForEvent } from "./notification-preferences";

describe("notification preferences", () => {
  it.each([
    [{ type: "ScanStarted" }, "scan"],
    [{ type: "DownloadFinished", payload: { title: "Show" } }, "download"],
    [{ type: "RefreshStarted", payload: { anime_id: brandAnimeId(1), title: "Show" } }, "refresh"],
    [
      {
        type: "SearchMissingFinished",
        payload: { anime_id: brandAnimeId(1), count: 2, title: "Show" },
      },
      "search_missing",
    ],
    [
      { type: "ScanFolderStarted", payload: { anime_id: brandAnimeId(1), title: "Show" } },
      "scan_folder",
    ],
    [
      { type: "RenameFinished", payload: { anime_id: brandAnimeId(1), count: 2, title: "Show" } },
      "rename",
    ],
    [{ type: "ImportStarted", payload: { count: 2 } }, "import"],
    [{ type: "LibraryScanFinished", payload: { matched: 1, scanned: 2 } }, "library_scan"],
    [{ type: "RssCheckStarted" }, "rss_check"],
    [{ type: "PasswordChanged" }, "account"],
    [{ type: "ApiKeyRegenerated" }, "account"],
    [{ type: "Error", payload: { message: "Bad" } }, "error"],
    [{ type: "Info", payload: { message: "OK" } }, "info"],
  ] satisfies Array<readonly [NotificationEvent, string]>)(
    "maps $type to preference",
    (event, key) => {
      expect(getNotificationPreferenceKeyForEvent(event)).toBe(key);
    },
  );

  it.each([
    { type: "ScanProgress", payload: { current: 1, total: 2 } },
    { type: "LibraryScanProgress", payload: { scanned: 2 } },
    { type: "RssCheckProgress", payload: { current: 1, feed_name: "feed", total: 2 } },
    { type: "DownloadProgress", payload: { downloads: [] } },
    {
      type: "SystemStatus",
      payload: {
        active_torrents: 0,
        disk_space: { free: 1, total: 2 },
        metadata_providers: {
          anidb: { configured: false, enabled: false },
          jikan: { configured: true, enabled: true },
          manami: { configured: true, enabled: true },
        },
        pending_downloads: 0,
        uptime: 10,
        version: "0.0.1",
      },
    },
  ] satisfies NotificationEvent[])(
    "does not gate progress event $type behind a notification preference",
    (event) => {
      expect(getNotificationPreferenceKeyForEvent(event)).toBeNull();
    },
  );
});
