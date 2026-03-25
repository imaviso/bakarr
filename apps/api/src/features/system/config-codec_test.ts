import { assertEquals, it } from "../../test/vitest.ts";
import { Cause, Effect, Exit } from "effect";

import { qualityProfiles, releaseProfiles } from "../../db/schema.ts";
import {
  decodeConfigCore,
  decodeOptionalNumberList,
  decodeQualityProfileRow,
  decodeReleaseProfileRow,
  decodeReleaseProfileRules,
  effectDecodeStoredConfigRow,
  encodeConfigCore,
  encodeOptionalNumberList,
  encodeQualityProfileRow,
  encodeReleaseProfileRules,
} from "./config-codec.ts";

it("config codec round-trips config core without mutating arrays", () => {
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
      max_concurrent_checks: 3,
      metadata_refresh_hours: 24,
    },
  });

  const decoded = decodeConfigCore(encoded);
  assertEquals(decoded.downloads.remote_path_mappings, [["/remote", "/local"]]);
  assertEquals(decoded.downloads.preferred_groups, ["SubsPlease"]);
  assertEquals(decoded.scheduler.cron_expression, "0 * * * *");
});

it("profile codecs encode and decode quality and release profile rows", () => {
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

it("optional number list codec normalizes duplicates and invalid values", () => {
  assertEquals(encodeOptionalNumberList([3, 1, 3, -1, 2]), "[1,2,3]");
  assertEquals(encodeOptionalNumberList([]), null);
  assertEquals(decodeOptionalNumberList("[3,1,2]"), [3, 1, 2]);
  assertEquals(decodeOptionalNumberList("not-json"), []);
});

it.effect("stored config row decoder fails with typed errors for missing and corrupt rows", () =>
  Effect.gen(function* () {
    const missingExit = yield* Effect.exit(
      effectDecodeStoredConfigRow(undefined),
    );
    assertEquals(Exit.isFailure(missingExit), true);
    if (Exit.isFailure(missingExit)) {
      const failure = Cause.failureOption(missingExit.cause);
      assertEquals(failure._tag, "Some");
      if (failure._tag === "Some") {
        assertEquals(failure.value._tag, "StoredConfigMissingError");
      }
    }

    const corruptExit = yield* Effect.exit(
      effectDecodeStoredConfigRow({ data: "{not-json" }),
    );
    assertEquals(Exit.isFailure(corruptExit), true);
    if (Exit.isFailure(corruptExit)) {
      const failure = Cause.failureOption(corruptExit.cause);
      assertEquals(failure._tag, "Some");
      if (failure._tag === "Some") {
        assertEquals(failure.value._tag, "StoredConfigCorruptError");
      }
    }
  })
);
