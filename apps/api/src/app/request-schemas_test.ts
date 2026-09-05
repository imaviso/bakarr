import { assert, it } from "@effect/vitest";
import { Schema, SchemaIssue } from "effect";
import {
  ApiKeyLoginRequestSchema,
  ChangePasswordRequestSchema,
  LoginRequestSchema,
} from "@packages/shared/index.ts";

import { formatValidationErrorMessage } from "@/infra/http/route-validation.ts";
import {
  AddRssFeedBodySchema,
  BrowseQuerySchema,
  DownloadEventsExportQuerySchema,
  DownloadEventsQuerySchema,
  ImportFilesBodySchema,
  ImportUnmappedFolderBodySchema,
  SearchDownloadBodySchema,
  CalendarQuerySchema,
} from "@/features/operations/request-schemas.ts";
import {
  AddMediaInputSchema,
  BulkUnitMappingsBodySchema,
} from "@/features/media/request-schemas.ts";
import {
  ConfigSchema,
  SystemLogExportQuerySchema,
  SystemLogsQuerySchema,
} from "@/features/system/http/request-schemas.ts";

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
      anime_path: "./library/anime",
      manga_path: "./library/manga",
      light_novel_path: "./library/light-novels",
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
    rtorrent: {
      enabled: false,
      save_path: null,
      trusted_local: true,
      url: "scgi://localhost:5000",
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
  const result = Schema.decodeUnknownResult(ConfigSchema, { errors: "all" })({
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

  assert.deepStrictEqual(result._tag, "Failure");

  if (result._tag === "Failure") {
    // v4 default formatter only details the first issue; use the standard
    // schema formatter to see every failing path.
    const issues = SchemaIssue.makeFormatterStandardSchemaV1()(result.failure.issue).issues;
    const paths = issues.map((issue) =>
      (issue.path ?? []).map((p) => globalThis.String(p)).join("."),
    );
    assert.ok(paths.some((p) => p === "library.import_mode"));
    assert.ok(paths.some((p) => p === "library.preferred_title"));
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
  const result = Schema.decodeUnknownResult(ConfigSchema)(input);

  assert.deepStrictEqual(result._tag, "Failure");

  if (result._tag === "Failure") {
    const message = formatValidationErrorMessage(
      "Invalid request body for system config",
      result.failure,
    );
    assert.match(message, /system config/);
    assert.match(message, /library[.]import_mode/);
    // v4 issue messages describe the expectation without an "actual" clause.
    assert.match(message, /Expected "copy" \| "move"/);
    assert.deepStrictEqual(message.includes("readonly downloads"), false);
  }
});

it("SearchDownloadBodySchema rejects non-positive and fractional identifiers", () => {
  const result = Schema.decodeUnknownResult(SearchDownloadBodySchema)(
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

  assert.deepStrictEqual(result._tag, "Failure");

  if (result._tag === "Failure") {
    assert.match(result.failure.message, /media_id/);
    assert.match(result.failure.message, /unit_number/);
  }
});

it("auth request schemas reject oversized credentials and malformed API keys", () => {
  const oversized = "x".repeat(257);

  assert.deepStrictEqual(
    Schema.decodeUnknownResult(LoginRequestSchema)({ password: oversized, username: "admin" })._tag,
    "Failure",
  );
  assert.deepStrictEqual(
    Schema.decodeUnknownResult(ChangePasswordRequestSchema)({
      current_password: "adminadmin",
      new_password: oversized,
    })._tag,
    "Failure",
  );
  assert.deepStrictEqual(
    Schema.decodeUnknownResult(ApiKeyLoginRequestSchema)({ api_key: "not hex" })._tag,
    "Failure",
  );
});

it("SearchDownloadBodySchema accepts structured release context", () => {
  const result = Schema.decodeUnknownResult(SearchDownloadBodySchema)({
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

  assert.deepStrictEqual(result._tag, "Success");
});

it("AddMediaInputSchema and ImportFilesBodySchema require positive integer ids", () => {
  const addMedia = Schema.decodeUnknownResult(AddMediaInputSchema)(
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

  const importFiles = Schema.decodeUnknownResult(ImportFilesBodySchema)(
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

  assert.deepStrictEqual(addMedia._tag, "Failure");
  assert.deepStrictEqual(importFiles._tag, "Failure");

  if (addMedia._tag === "Failure") {
    assert.match(addMedia.failure.message, /id/);
    assert.match(addMedia.failure.message, /release_profile_ids/);
  }

  if (importFiles._tag === "Failure") {
    assert.match(importFiles.failure.message, /unit_number/);
  }
});

it("ImportFilesBodySchema accepts source metadata for naming reuse", () => {
  const importFiles = Schema.decodeUnknownResult(ImportFilesBodySchema)({
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

  assert.deepStrictEqual(importFiles._tag, "Success");
});

it("DownloadEventsQuerySchema accepts filtered query params", () => {
  const query = Schema.decodeUnknownResult(DownloadEventsQuerySchema)({
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

  assert.deepStrictEqual(query._tag, "Success");
});

it("DownloadEventsQuerySchema caps limit at 500", () => {
  const atCap = Schema.decodeUnknownResult(DownloadEventsQuerySchema)({ limit: "500" });
  const overCap = Schema.decodeUnknownResult(DownloadEventsQuerySchema)({ limit: "501" });

  assert.deepStrictEqual(atCap._tag, "Success");
  assert.deepStrictEqual(overCap._tag, "Failure");
});

it("DownloadEventsExportQuerySchema caps limit at 500", () => {
  const atCap = Schema.decodeUnknownResult(DownloadEventsExportQuerySchema)({
    format: "csv",
    limit: "500",
  });
  const overCap = Schema.decodeUnknownResult(DownloadEventsExportQuerySchema)({
    format: "csv",
    limit: "9999",
  });

  assert.deepStrictEqual(atCap._tag, "Success");
  assert.deepStrictEqual(overCap._tag, "Failure");
});

it("DownloadEventsExportQuerySchema accepts export query params", () => {
  const query = Schema.decodeUnknownResult(DownloadEventsExportQuerySchema)({
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

  assert.deepStrictEqual(query._tag, "Success");
});

it("SystemLogsQuerySchema rejects unsupported log levels", () => {
  const query = Schema.decodeUnknownResult(SystemLogsQuerySchema)({
    level: "verbose",
  });

  assert.deepStrictEqual(query._tag, "Failure");
});

it("AddMediaInputSchema accepts existing-root flag", () => {
  const addMedia = Schema.decodeUnknownResult(AddMediaInputSchema)({
    id: 20,
    monitor_and_search: false,
    monitored: true,
    profile_name: "Default",
    release_profile_ids: [],
    root_folder: "/library/Naruto Fansub",
    use_existing_root: true,
  });

  assert.deepStrictEqual(addMedia._tag, "Success");
});

it("AddRssFeedBodySchema accepts http(s) RSS URLs", () => {
  const httpsResult = Schema.decodeUnknownResult(AddRssFeedBodySchema)({
    media_id: 20,
    url: "https://example.com/feed.xml",
  });
  const httpResult = Schema.decodeUnknownResult(AddRssFeedBodySchema)({
    media_id: 20,
    url: "http://example.com/feed.xml",
  });

  assert.deepStrictEqual(httpsResult._tag, "Success");
  assert.deepStrictEqual(httpResult._tag, "Success");
});

it("AddRssFeedBodySchema rejects private, loopback, and link-local feed URLs", () => {
  const urls = [
    "http://localhost:8080/feed.xml",
    "http://127.0.0.1:9192/feed",
    "https://192.168.1.10/feed.xml",
    "https://10.0.0.5/feed.xml",
    "https://172.16.0.9/feed.xml",
    "https://169.254.1.1/feed.xml",
    "http://[::1]:8080/feed.xml",
    "https://[fe80::1]/feed.xml",
    "http://myhost.localhost/feed",
  ];

  for (const url of urls) {
    const result = Schema.decodeUnknownResult(AddRssFeedBodySchema)({ media_id: 20, url });
    assert.deepStrictEqual(result._tag, "Failure", `expected rejection for ${url}`);
  }
});

it("boundary request schemas reject malformed URL, path, and date inputs", () => {
  const rssFeed = Schema.decodeUnknownResult(AddRssFeedBodySchema)({
    media_id: 20,
    url: "ftp://example.com/feed",
  });
  const browse = Schema.decodeUnknownResult(BrowseQuerySchema)({
    path: "relative/path",
  });
  const unmappedImport = Schema.decodeUnknownResult(ImportUnmappedFolderBodySchema)({
    media_id: 20,
    folder_name: "../escape",
  });
  const calendar = Schema.decodeUnknownResult(CalendarQuerySchema)({
    start: "not-a-date",
  });
  const systemLogExport = Schema.decodeUnknownResult(SystemLogExportQuerySchema)({
    start_date: "2026-03-18 00:00:00",
  });

  assert.deepStrictEqual(rssFeed._tag, "Failure");
  assert.deepStrictEqual(browse._tag, "Failure");
  assert.deepStrictEqual(unmappedImport._tag, "Failure");
  assert.deepStrictEqual(calendar._tag, "Failure");
  assert.deepStrictEqual(systemLogExport._tag, "Failure");
});

it("BulkUnitMappingsBodySchema accepts empty file_path as unmap signal", () => {
  const unmapOnly = Schema.decodeUnknownResult(BulkUnitMappingsBodySchema)({
    mappings: [{ unit_number: 1, file_path: "" }],
  });
  const mixed = Schema.decodeUnknownResult(BulkUnitMappingsBodySchema)({
    mappings: [
      { unit_number: 1, file_path: "" },
      { unit_number: 2, file_path: "/library/Naruto - 02.mkv" },
    ],
  });

  assert.deepStrictEqual(unmapOnly._tag, "Success");
  assert.deepStrictEqual(mixed._tag, "Success");
  if (mixed._tag === "Success") {
    assert.strictEqual(mixed.success.mappings.length, 2);
    assert.strictEqual(mixed.success.mappings[0]?.file_path, "");
    assert.strictEqual(mixed.success.mappings[1]?.file_path, "/library/Naruto - 02.mkv");
  }
});

it("BulkUnitMappingsBodySchema rejects non-positive unit_number", () => {
  const result = Schema.decodeUnknownResult(BulkUnitMappingsBodySchema)({
    mappings: [{ unit_number: 0, file_path: "" }],
  });

  assert.deepStrictEqual(result._tag, "Failure");
});

it("BulkUnitMappingsBodySchema rejects missing mappings array", () => {
  const result = Schema.decodeUnknownResult(BulkUnitMappingsBodySchema)({});

  assert.deepStrictEqual(result._tag, "Failure");
});
