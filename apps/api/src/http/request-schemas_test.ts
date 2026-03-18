import { assertEquals, assertMatch } from "@std/assert";
import { Effect, Schema } from "effect";

import { parseJsonBody } from "./route-helpers.ts";
import {
  AddAnimeInputSchema,
  ConfigSchema,
  DownloadEventsExportQuerySchema,
  DownloadEventsQuerySchema,
  ImportFilesBodySchema,
  SearchDownloadBodySchema,
} from "./request-schemas.ts";

function makeValidConfig() {
  return {
    downloads: {
      create_anime_folders: true,
      delete_download_files_after_import: false,
      max_size_gb: 8,
      prefer_dual_audio: false,
      preferred_codec: "hevc",
      preferred_groups: ["SubsPlease"],
      reconcile_completed_downloads: true,
      remote_path_mappings: [["/remote/downloads", "/local/downloads"]],
      remove_torrent_on_import: true,
      root_path: "./downloads",
      use_seadex: true,
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
      default_category: "anime",
      enabled: true,
      password: "secret",
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

Deno.test("ConfigSchema rejects malformed config fields with localized paths", () => {
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

  assertEquals(result._tag, "Left");

  if (result._tag === "Left") {
    assertMatch(result.left.message, /remote_path_mappings/);
    assertMatch(result.left.message, /import_mode/);
    assertMatch(result.left.message, /preferred_title/);
  }
});

Deno.test("parseJsonBody formats schema validation errors as concise path summaries", async () => {
  const parsed = await Effect.runPromise(
    parseJsonBody(
      {
        req: {
          json: () =>
            Promise.resolve({
              ...makeValidConfig(),
              library: {
                ...makeValidConfig().library,
                import_mode: "Copy",
              },
            }),
        },
      },
      ConfigSchema,
      "system config",
    ).pipe(Effect.either),
  );

  assertEquals(parsed._tag, "Left");

  if (parsed._tag === "Left") {
    assertMatch(parsed.left.message, /system config/);
    assertMatch(parsed.left.message, /library\.import_mode/);
    assertMatch(parsed.left.message, /actual "Copy"/);
    assertEquals(parsed.left.message.includes("readonly downloads"), false);
  }
});

Deno.test("SearchDownloadBodySchema rejects non-positive and fractional identifiers", () => {
  const result = Schema.decodeUnknownEither(SearchDownloadBodySchema)({
    anime_id: 0,
    episode_number: 1.5,
    magnet: "magnet:?xt=urn:btih:test",
    release_metadata: {
      group: "SubsPlease",
    },
    title: "Example release",
  });

  assertEquals(result._tag, "Left");

  if (result._tag === "Left") {
    assertMatch(result.left.message, /anime_id/);
    assertMatch(result.left.message, /episode_number/);
  }
});

Deno.test("SearchDownloadBodySchema accepts structured release metadata", () => {
  const result = Schema.decodeUnknownEither(SearchDownloadBodySchema)({
    anime_id: 1,
    decision_reason: "Accepted (WEB-DL 1080p, score 12)",
    episode_number: 2,
    info_hash: "abcdef",
    magnet: "magnet:?xt=urn:btih:test",
    release_metadata: {
      air_date: "2025-03-14",
      chosen_from_seadex: true,
      group: "SubsPlease",
      parsed_title: "[SubsPlease] Show - 02 (1080p)",
      previous_quality: "WEB-DL 720p",
      previous_score: 7,
      resolution: "1080p",
      selection_kind: "upgrade",
      selection_score: 12,
      source_identity: {
        episode_numbers: [2],
        label: "02",
        scheme: "absolute",
      },
    },
    title: "[SubsPlease] Show - 02 (1080p)",
  });

  assertEquals(result._tag, "Right");
});

Deno.test("AddAnimeInputSchema and ImportFilesBodySchema require positive integer ids", () => {
  const addAnime = Schema.decodeUnknownEither(AddAnimeInputSchema)({
    id: -3,
    monitor_and_search: false,
    monitored: true,
    profile_name: "Default",
    release_profile_ids: [1, 2.5],
    root_folder: "/library",
    use_existing_root: true,
  });

  const importFiles = Schema.decodeUnknownEither(ImportFilesBodySchema)({
    files: [{
      anime_id: 2,
      episode_number: 0,
      source_path: "/downloads/file.mkv",
    }],
  });

  assertEquals(addAnime._tag, "Left");
  assertEquals(importFiles._tag, "Left");

  if (addAnime._tag === "Left") {
    assertMatch(addAnime.left.message, /id/);
    assertMatch(addAnime.left.message, /release_profile_ids/);
  }

  if (importFiles._tag === "Left") {
    assertMatch(importFiles.left.message, /episode_number/);
  }
});

Deno.test("ImportFilesBodySchema accepts source metadata for naming reuse", () => {
  const importFiles = Schema.decodeUnknownEither(ImportFilesBodySchema)({
    files: [{
      anime_id: 2,
      episode_number: 1,
      source_metadata: {
        quality: "WEB-DL",
        resolution: "1080p",
        source_identity: {
          episode_numbers: [1],
          label: "S01E01",
          scheme: "season",
          season: 1,
        },
      },
      source_path: "/downloads/file.mkv",
    }],
  });

  assertEquals(importFiles._tag, "Right");
});

Deno.test("DownloadEventsQuerySchema accepts filtered query params", () => {
  const query = Schema.decodeUnknownEither(DownloadEventsQuerySchema)({
    anime_id: "20",
    cursor: "400",
    direction: "next",
    download_id: "4",
    end_date: "2026-03-18T23:59:59",
    event_type: "download.imported",
    limit: "25",
    start_date: "2026-03-17T00:00:00",
    status: "imported",
  });

  assertEquals(query._tag, "Right");
});

Deno.test("DownloadEventsExportQuerySchema accepts export query params", () => {
  const query = Schema.decodeUnknownEither(DownloadEventsExportQuerySchema)({
    anime_id: "20",
    download_id: "4",
    end_date: "2026-03-18T23:59:59",
    event_type: "download.imported",
    format: "csv",
    limit: "500",
    order: "asc",
    start_date: "2026-03-17T00:00:00",
    status: "imported",
  });

  assertEquals(query._tag, "Right");
});

Deno.test("AddAnimeInputSchema accepts existing-root flag", () => {
  const addAnime = Schema.decodeUnknownEither(AddAnimeInputSchema)({
    id: 20,
    monitor_and_search: false,
    monitored: true,
    profile_name: "Default",
    release_profile_ids: [],
    root_folder: "/library/Naruto Fansub",
    use_existing_root: true,
  });

  assertEquals(addAnime._tag, "Right");
});
