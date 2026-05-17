import { assert, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  ApiKeyLoginRequestSchema,
  ChangePasswordRequestSchema,
  LoginRequestSchema,
} from "@packages/shared/index.ts";

import { formatValidationErrorMessage } from "@/http/shared/route-validation.ts";
import {
  AddRssFeedBodySchema,
  BrowseQuerySchema,
  DownloadEventsExportQuerySchema,
  DownloadEventsQuerySchema,
  ImportFilesBodySchema,
  ImportUnmappedFolderBodySchema,
  SearchDownloadBodySchema,
  CalendarQuerySchema,
} from "@/http/operations/request-schemas.ts";
import { AddAnimeInputSchema } from "@/http/media/request-schemas.ts";
import {
  ConfigSchema,
  SystemLogExportQuerySchema,
  SystemLogsQuerySchema,
} from "@/http/system/request-schemas.ts";

function makeValidConfig() {
  return {
    downloads: {
      create_media_folders: true,
      delete_download_files_after_import: false,
      reconcile_completed_downloads: true,
      remote_path_mappings: [["/remote/downloads", "/local/downloads"]],
      remove_torrent_on_import: true,
      root_path: "./downloads",
    },
    general: {
      database_path: "./bakarr.sqlite",
      images_path: "./images",
      log_level: "info",
      max_db_connections: 4,
      min_db_connections: 1,
      suppress_connection_errors: true,
      worker_threads: 4,
    },
    library: {
      auto_scan_interval_hours: 12,
      import_mode: "copy",
      library_path: "./library",
      movie_naming_format: "{title}",
      naming_format: "{title} - {episode}",
      preferred_title: "romaji",
      recycle_cleanup_days: 30,
      recycle_path: "./recycle-bin",
    },
    nyaa: {
      base_url: "https://nyaa.si",
      default_category: "1_2",
      filter_remakes: true,
      min_seeders: 2,
      preferred_resolution: "1080p",
    },
    profiles: [
      {
        allowed_qualities: ["1080p", "720p"],
        cutoff: "1080p",
        max_size: null,
        min_size: null,
        name: "Default",
        seadex_preferred: true,
        upgrade_allowed: true,
      },
    ],
    qbittorrent: {
      default_category: "media",
      enabled: true,
      password: "secret",
      ratio_limit: 1.5,
      save_path: "/downloads/media",
      url: "http://localhost:8080",
      username: "admin",
    },
    scheduler: {
      check_delay_seconds: 5,
      check_interval_minutes: 30,
      cron_expression: "0 * * * *",
      enabled: true,
      max_concurrent_checks: 2,
      metadata_refresh_hours: 24,
    },
  };
}

it("ConfigSchema rejects malformed config fields with localized paths", () => {
  const result = Schema.decodeUnknownEither(ConfigSchema)({
    ...makeValidConfig(),
    downloads: {
      ...makeValidConfig().downloads,
      remote_path_mappings: [["/remote/only"]],
    },
    library: {
      ...makeValidConfig().library,
      import_mode: "link",
      preferred_title: "kana",
    },
  });

  assert.deepStrictEqual(result._tag, "Left");

  if (result._tag === "Left") {
    assert.match(result.left.message, /remote_path_mappings/);
    assert.match(result.left.message, /import_mode/);
    assert.match(result.left.message, /preferred_title/);
  }
});

it("formatValidationErrorMessage formats schema errors as concise path summaries", () => {
  const input = {
    ...makeValidConfig(),
    library: {
      ...makeValidConfig().library,
      import_mode: "Copy",
    },
  };
  const result = Schema.decodeUnknownEither(ConfigSchema)(input);

  assert.deepStrictEqual(result._tag, "Left");

  if (result._tag === "Left") {
    const message = formatValidationErrorMessage(
      "Invalid request body for system config",
      result.left,
    );
    assert.match(message, /system config/);
    assert.match(message, /library\.import_mode/);
    assert.match(message, /actual "Copy"/);
    assert.deepStrictEqual(message.includes("readonly downloads"), false);
  }
});

it("SearchDownloadBodySchema rejects non-positive and fractional identifiers", () => {
  const result = Schema.decodeUnknownEither(SearchDownloadBodySchema)(
    {
      media_id: 0,
      unit_number: 1.5,
      magnet: "magnet:?xt=urn:btih:test",
      release_context: {
        group: "SubsPlease",
      },
      title: "Example release",
    },
    { errors: "all" },
  );

  assert.deepStrictEqual(result._tag, "Left");

  if (result._tag === "Left") {
    assert.match(result.left.message, /media_id/);
    assert.match(result.left.message, /unit_number/);
  }
});

it("auth request schemas reject oversized credentials and malformed API keys", () => {
  const oversized = "x".repeat(257);

  assert.deepStrictEqual(
    Schema.decodeUnknownEither(LoginRequestSchema)({ password: oversized, username: "admin" })._tag,
    "Left",
  );
  assert.deepStrictEqual(
    Schema.decodeUnknownEither(ChangePasswordRequestSchema)({
      current_password: "adminadmin",
      new_password: oversized,
    })._tag,
    "Left",
  );
  assert.deepStrictEqual(
    Schema.decodeUnknownEither(ApiKeyLoginRequestSchema)({ api_key: "not hex" })._tag,
    "Left",
  );
});

it("SearchDownloadBodySchema accepts structured release context", () => {
  const result = Schema.decodeUnknownEither(SearchDownloadBodySchema)({
    media_id: 1,
    unit_number: 2,
    magnet: "magnet:?xt=urn:btih:test",
    release_context: {
      download_action: {
        Accept: {
          is_seadex: true,
          quality: {
            id: 2,
            name: "WEB-DL 1080p",
            rank: 100,
            resolution: 1080,
            source: "WEB-DL",
          },
          score: 12,
        },
      },
      group: "SubsPlease",
      info_hash: "abcdef",
      is_seadex: true,
      parsed_resolution: "1080p",
      source_url: "https://nyaa.si/view/1",
      trusted: true,
    },
    title: "[SubsPlease] Show - 02 (1080p)",
  });

  assert.deepStrictEqual(result._tag, "Right");
});

it("AddAnimeInputSchema and ImportFilesBodySchema require positive integer ids", () => {
  const addMedia = Schema.decodeUnknownEither(AddAnimeInputSchema)(
    {
      id: -3,
      monitor_and_search: false,
      monitored: true,
      profile_name: "Default",
      release_profile_ids: [1, 2.5],
      root_folder: "/library",
      use_existing_root: true,
    },
    { errors: "all" },
  );

  const importFiles = Schema.decodeUnknownEither(ImportFilesBodySchema)(
    {
      files: [
        {
          media_id: 2,
          unit_number: 0,
          source_path: "/downloads/file.mkv",
        },
      ],
    },
    { errors: "all" },
  );

  assert.deepStrictEqual(addMedia._tag, "Left");
  assert.deepStrictEqual(importFiles._tag, "Left");

  if (addMedia._tag === "Left") {
    assert.match(addMedia.left.message, /id/);
    assert.match(addMedia.left.message, /release_profile_ids/);
  }

  if (importFiles._tag === "Left") {
    assert.match(importFiles.left.message, /unit_number/);
  }
});

it("ImportFilesBodySchema accepts source metadata for naming reuse", () => {
  const importFiles = Schema.decodeUnknownEither(ImportFilesBodySchema)({
    files: [
      {
        media_id: 2,
        unit_number: 1,
        source_metadata: {
          quality: "WEB-DL",
          resolution: "1080p",
          source_identity: {
            unit_numbers: [1],
            label: "S01E01",
            scheme: "season",
            season: 1,
          },
        },
        source_path: "/downloads/file.mkv",
      },
    ],
  });

  assert.deepStrictEqual(importFiles._tag, "Right");
});

it("DownloadEventsQuerySchema accepts filtered query params", () => {
  const query = Schema.decodeUnknownEither(DownloadEventsQuerySchema)({
    media_id: "20",
    cursor: "400",
    direction: "next",
    download_id: "4",
    end_date: "2026-03-18T23:59:59",
    event_type: "download.imported",
    limit: "25",
    start_date: "2026-03-17T00:00:00",
    status: "imported",
  });

  assert.deepStrictEqual(query._tag, "Right");
});

it("DownloadEventsExportQuerySchema accepts export query params", () => {
  const query = Schema.decodeUnknownEither(DownloadEventsExportQuerySchema)({
    media_id: "20",
    download_id: "4",
    end_date: "2026-03-18T23:59:59",
    event_type: "download.imported",
    format: "csv",
    limit: "500",
    order: "asc",
    start_date: "2026-03-17T00:00:00",
    status: "imported",
  });

  assert.deepStrictEqual(query._tag, "Right");
});

it("SystemLogsQuerySchema rejects unsupported log levels", () => {
  const query = Schema.decodeUnknownEither(SystemLogsQuerySchema)({
    level: "verbose",
  });

  assert.deepStrictEqual(query._tag, "Left");
});

it("AddAnimeInputSchema accepts existing-root flag", () => {
  const addMedia = Schema.decodeUnknownEither(AddAnimeInputSchema)({
    id: 20,
    monitor_and_search: false,
    monitored: true,
    profile_name: "Default",
    release_profile_ids: [],
    root_folder: "/library/Naruto Fansub",
    use_existing_root: true,
  });

  assert.deepStrictEqual(addMedia._tag, "Right");
});

it("AddRssFeedBodySchema accepts http(s) RSS URLs", () => {
  const httpsResult = Schema.decodeUnknownEither(AddRssFeedBodySchema)({
    media_id: 20,
    url: "https://example.com/feed.xml",
  });
  const httpResult = Schema.decodeUnknownEither(AddRssFeedBodySchema)({
    media_id: 20,
    url: "http://example.com/feed.xml",
  });

  assert.deepStrictEqual(httpsResult._tag, "Right");
  assert.deepStrictEqual(httpResult._tag, "Right");
});

it("boundary request schemas reject malformed URL, path, and date inputs", () => {
  const rssFeed = Schema.decodeUnknownEither(AddRssFeedBodySchema)({
    media_id: 20,
    url: "ftp://example.com/feed",
  });
  const browse = Schema.decodeUnknownEither(BrowseQuerySchema)({
    path: "relative/path",
  });
  const unmappedImport = Schema.decodeUnknownEither(ImportUnmappedFolderBodySchema)({
    media_id: 20,
    folder_name: "../escape",
  });
  const calendar = Schema.decodeUnknownEither(CalendarQuerySchema)({
    start: "not-a-date",
  });
  const systemLogExport = Schema.decodeUnknownEither(SystemLogExportQuerySchema)({
    start_date: "2026-03-18 00:00:00",
  });

  assert.deepStrictEqual(rssFeed._tag, "Left");
  assert.deepStrictEqual(browse._tag, "Left");
  assert.deepStrictEqual(unmappedImport._tag, "Left");
  assert.deepStrictEqual(calendar._tag, "Left");
  assert.deepStrictEqual(systemLogExport._tag, "Left");
});
