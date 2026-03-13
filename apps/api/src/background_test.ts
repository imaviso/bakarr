import { assertEquals } from "@std/assert";

import type { Config } from "../../../packages/shared/src/index.ts";
import { buildBackgroundSchedule } from "./background-schedule.ts";

const baseConfig: Config = {
  downloads: {
    create_anime_folders: true,
    max_size_gb: 8,
    prefer_dual_audio: false,
    preferred_codec: null,
    preferred_groups: [],
    remote_path_mappings: [],
    root_path: "./downloads",
    use_seadex: true,
  },
  general: {
    database_path: "./bakarr.sqlite",
    images_path: "./data/images",
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
    naming_format: "{title}",
    preferred_title: "romaji",
    recycle_cleanup_days: 30,
    recycle_path: "./recycle-bin",
  },
  nyaa: {
    base_url: "https://nyaa.si",
    default_category: "1_2",
    filter_remakes: true,
    min_seeders: 1,
    preferred_resolution: "1080p",
  },
  profiles: [],
  qbittorrent: {
    default_category: "anime",
    enabled: false,
    password: null,
    url: "http://localhost:8080",
    username: "admin",
  },
  scheduler: {
    check_delay_seconds: 5,
    check_interval_minutes: 30,
    cron_expression: null,
    enabled: true,
    max_concurrent_checks: 2,
    metadata_refresh_hours: 24,
  },
  security: {
    argon2_memory_cost_kib: 19456,
    argon2_parallelism: 1,
    argon2_time_cost: 2,
    auto_migrate_password_hashes: false,
    auth_throttle: {
      lockout_seconds: 300,
      login_base_delay_ms: 250,
      login_max_delay_ms: 1500,
      max_attempts: 5,
      password_base_delay_ms: 250,
      password_max_delay_ms: 1500,
      trusted_proxy_ips: [],
      window_seconds: 300,
    },
  },
};

Deno.test("build background schedule enables RSS and library loops", () => {
  const schedule = buildBackgroundSchedule(baseConfig);

  assertEquals(schedule.initialDelayMs, 5_000);
  assertEquals(schedule.downloadSyncMs, 15_000);
  assertEquals(schedule.rssCheckMs, 30 * 60 * 1000);
  assertEquals(schedule.libraryScanMs, 12 * 60 * 60 * 1000);
});

Deno.test("build background schedule disables loops when config disables them", () => {
  const schedule = buildBackgroundSchedule({
    ...baseConfig,
    library: {
      ...baseConfig.library,
      auto_scan_interval_hours: 0,
    },
    scheduler: {
      ...baseConfig.scheduler,
      enabled: false,
    },
  });

  assertEquals(schedule.initialDelayMs, 5_000);
  assertEquals(schedule.rssCheckMs, null);
  assertEquals(schedule.libraryScanMs, null);
});

Deno.test("build background schedule prefers valid cron over interval", () => {
  const schedule = buildBackgroundSchedule({
    ...baseConfig,
    scheduler: {
      ...baseConfig.scheduler,
      check_interval_minutes: 30,
      cron_expression: "0 * * * *",
      enabled: true,
    },
  });

  assertEquals(schedule.rssCronExpression, "0 * * * *");
  assertEquals(schedule.rssCheckMs, null);
});

Deno.test("build background schedule ignores invalid cron and keeps interval", () => {
  const schedule = buildBackgroundSchedule({
    ...baseConfig,
    scheduler: {
      ...baseConfig.scheduler,
      check_interval_minutes: 30,
      cron_expression: "not a cron",
      enabled: true,
    },
  });

  assertEquals(schedule.rssCronExpression, null);
  assertEquals(schedule.rssCheckMs, 30 * 60 * 1000);
});
