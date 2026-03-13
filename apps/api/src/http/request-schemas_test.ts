import { assertEquals, assertMatch } from "@std/assert";
import { Effect, Schema } from "effect";

import { parseJsonBody } from "./route-helpers.ts";
import { ConfigSchema } from "./request-schemas.ts";

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

Deno.test("parseJsonBody includes schema validation detail in request errors", async () => {
  const parsed = await Effect.runPromise(
    parseJsonBody(
      {
        req: {
          json: () =>
            Promise.resolve({
              ...makeValidConfig(),
              library: {
                ...makeValidConfig().library,
                import_mode: "link",
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
    assertMatch(parsed.left.message, /import_mode/);
  }
});
