import { assertEquals, assertMatch } from "@std/assert";
import { Effect, Schema } from "effect";

import { parseJsonBody } from "./route-helpers.ts";
import {
  AddAnimeInputSchema,
  ConfigSchema,
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
    security: {
      argon2_memory_cost_kib: 19456,
      argon2_parallelism: 1,
      argon2_time_cost: 2,
      auth_throttle: {
        lockout_seconds: 300,
        login_base_delay_ms: 250,
        login_max_delay_ms: 1500,
        max_attempts: 5,
        password_base_delay_ms: 250,
        password_max_delay_ms: 1500,
        trusted_proxy_ips: ["127.0.0.1"],
        window_seconds: 300,
      },
      auto_migrate_password_hashes: true,
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
    title: "Example release",
  });

  assertEquals(result._tag, "Left");

  if (result._tag === "Left") {
    assertMatch(result.left.message, /anime_id/);
    assertMatch(result.left.message, /episode_number/);
  }
});

Deno.test("AddAnimeInputSchema and ImportFilesBodySchema require positive integer ids", () => {
  const addAnime = Schema.decodeUnknownEither(AddAnimeInputSchema)({
    id: -3,
    monitor_and_search: false,
    monitored: true,
    profile_name: "Default",
    release_profile_ids: [1, 2.5],
    root_folder: "/library",
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
