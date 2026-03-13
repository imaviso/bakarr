import { assertEquals } from "@std/assert";

import { makeDefaultConfig } from "../system/defaults.ts";
import {
  shouldDeleteImportedData,
  shouldReconcileCompletedDownloads,
  shouldRemoveTorrentOnImport,
} from "./download-support.ts";

Deno.test("download support helpers use config values and defaults", () => {
  const config = {
    profiles: [],
    ...makeDefaultConfig("./test.sqlite"),
    downloads: {
      ...makeDefaultConfig("./test.sqlite").downloads,
      delete_download_files_after_import: true,
      reconcile_completed_downloads: false,
      remove_torrent_on_import: false,
    },
  };

  assertEquals(shouldReconcileCompletedDownloads(config), false);
  assertEquals(shouldRemoveTorrentOnImport(config), false);
  assertEquals(shouldDeleteImportedData(config), true);

  assertEquals(shouldReconcileCompletedDownloads(null), true);
  assertEquals(shouldRemoveTorrentOnImport(undefined), true);
  assertEquals(shouldDeleteImportedData(undefined), false);
});
