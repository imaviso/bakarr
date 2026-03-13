import { assertEquals } from "@std/assert";

import { qualityProfiles, releaseProfiles } from "../../db/schema.ts";
import {
  decodeConfigCore,
  decodeOptionalNumberList,
  decodeQualityProfileRow,
  decodeReleaseProfileRow,
  decodeReleaseProfileRules,
  encodeConfigCore,
  encodeOptionalNumberList,
  encodeQualityProfileRow,
  encodeReleaseProfileRules,
} from "./config-codec.ts";

Deno.test("config codec round-trips config core without mutating arrays", () => {
  const encoded = encodeConfigCore({
    downloads: {
      create_anime_folders: true,
      delete_download_files_after_import: true,
      max_size_gb: 8,
      prefer_dual_audio: false,
      preferred_codec: "hevc",
      preferred_groups: ["SubsPlease"],
      reconcile_completed_downloads: true,
      remote_path_mappings: [["/remote", "/local"]],
      remove_torrent_on_import: false,
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
      recycle_path: "./recycle",
    },
    nyaa: {
      base_url: "https://nyaa.si",
      default_category: "1_2",
      filter_remakes: true,
      min_seeders: 2,
      preferred_resolution: "1080p",
    },
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
  });

  const decoded = decodeConfigCore(encoded);
  assertEquals(decoded.downloads.remote_path_mappings, [["/remote", "/local"]]);
  assertEquals(decoded.downloads.preferred_groups, ["SubsPlease"]);
  assertEquals(decoded.security.auth_throttle.trusted_proxy_ips, ["127.0.0.1"]);
  assertEquals(decoded.scheduler.cron_expression, "0 * * * *");
});

Deno.test("profile codecs encode and decode quality and release profile rows", () => {
  const qualityRow = encodeQualityProfileRow({
    allowed_qualities: ["1080p", "720p"],
    cutoff: "1080p",
    max_size: "4GB",
    min_size: "700MB",
    name: "Default",
    seadex_preferred: true,
    upgrade_allowed: true,
  });

  assertEquals(
    decodeQualityProfileRow(
      qualityRow satisfies typeof qualityProfiles.$inferSelect,
    ),
    {
      allowed_qualities: ["1080p", "720p"],
      cutoff: "1080p",
      max_size: "4GB",
      min_size: "700MB",
      name: "Default",
      seadex_preferred: true,
      upgrade_allowed: true,
    },
  );

  const rulesJson = encodeReleaseProfileRules([
    { rule_type: "preferred", score: 10, term: "SubsPlease" },
    { rule_type: "must", score: 0, term: "1080p" },
  ]);
  assertEquals(decodeReleaseProfileRules(rulesJson), [
    { rule_type: "preferred", score: 10, term: "SubsPlease" },
    { rule_type: "must", score: 0, term: "1080p" },
  ]);

  assertEquals(
    decodeReleaseProfileRow(
      {
        enabled: true,
        id: 1,
        isGlobal: false,
        name: "Rules",
        rules: rulesJson,
      } satisfies typeof releaseProfiles.$inferSelect,
    ),
    {
      enabled: true,
      id: 1,
      is_global: false,
      name: "Rules",
      rules: [
        { rule_type: "preferred", score: 10, term: "SubsPlease" },
        { rule_type: "must", score: 0, term: "1080p" },
      ],
    },
  );
});

Deno.test("optional number list codec normalizes duplicates and invalid values", () => {
  assertEquals(encodeOptionalNumberList([3, 1, 3, -1, 2]), "[1,2,3]");
  assertEquals(encodeOptionalNumberList([]), null);
  assertEquals(decodeOptionalNumberList("[3,1,2]"), [3, 1, 2]);
  assertEquals(decodeOptionalNumberList("not-json"), []);
});
