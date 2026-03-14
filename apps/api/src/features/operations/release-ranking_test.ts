import { assertEquals } from "@std/assert";

import { defaultAppConfig } from "../../config.ts";
import type {
  Config,
  QualityProfile,
} from "../../../../../packages/shared/src/index.ts";
import {
  compareEpisodeSearchResults,
  decideDownloadAction,
  parseEpisodeFromTitle,
  parseEpisodeNumbersFromTitle,
  parseQualityFromTitle,
  parseReleaseName,
} from "./release-ranking.ts";

const baseConfig: Config = {
  downloads: {
    create_anime_folders: true,
    max_size_gb: 8,
    prefer_dual_audio: false,
    preferred_codec: null,
    preferred_groups: ["SubsPlease"],
    remote_path_mappings: [],
    root_path: "./downloads",
    use_seadex: true,
  },
  general: {
    database_path: defaultAppConfig.databaseFile,
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
    enabled: false,
    max_concurrent_checks: 2,
    metadata_refresh_hours: 24,
  },
};

const baseProfile: QualityProfile = {
  allowed_qualities: ["1080p", "720p"],
  cutoff: "1080p",
  name: "Default",
  seadex_preferred: true,
  upgrade_allowed: true,
};

Deno.test("parse release name extracts group, episode, and quality", () => {
  const parsed = parseReleaseName("[SubsPlease] Frieren - 05 (1080p) [WEB-DL]");

  assertEquals(parsed.group, "SubsPlease");
  assertEquals(parsed.episodeNumber, 5);
  assertEquals(parsed.resolution, "1080p");
  assertEquals(parsed.quality.name, "WEB-DL 1080p");
});

Deno.test("parse quality prefers bluray remux over webdl", () => {
  assertEquals(
    parseQualityFromTitle("[Group] Show - 01 [1080p BluRay]").name,
    "BluRay 1080p",
  );
  assertEquals(
    parseQualityFromTitle("[Group] Show - 01 [1080p Remux]").name,
    "BluRay 1080p Remux",
  );
});

Deno.test("decide download accepts new release and upgrades higher quality", () => {
  const accepted = decideDownloadAction(
    baseProfile,
    [],
    null,
    {
      group: "SubsPlease",
      isSeaDex: false,
      remake: false,
      seeders: 50,
      sizeBytes: 1024 ** 3,
      title: "[SubsPlease] Show - 01 (1080p)",
      trusted: true,
    },
    baseConfig,
  );

  assertEquals(Boolean(accepted.Accept), true);

  const upgraded = decideDownloadAction(
    baseProfile,
    [],
    {
      downloaded: true,
      filePath: "[Group] Show - 01 [720p WEB-DL].mkv",
      isSeaDex: false,
    },
    {
      group: "SubsPlease",
      isSeaDex: false,
      remake: false,
      seeders: 50,
      sizeBytes: 1024 ** 3,
      title: "[SubsPlease] Show - 01 [1080p BluRay]",
      trusted: true,
    },
    baseConfig,
  );

  assertEquals(Boolean(upgraded.Upgrade), true);
});

Deno.test("seadex release can upgrade same-quality current file", () => {
  const decision = decideDownloadAction(
    baseProfile,
    [],
    {
      downloaded: true,
      filePath: "[Group] Show - 01 [1080p WEB-DL].mkv",
      isSeaDex: false,
    },
    {
      group: "SubsPlease",
      isSeaDex: true,
      remake: false,
      seeders: 30,
      sizeBytes: 1024 ** 3,
      title: "[SubsPlease] Show - 01 [1080p WEB-DL]",
      trusted: true,
    },
    baseConfig,
  );

  assertEquals(Boolean(decision.Upgrade), true);
});

Deno.test("compare episode search results prefers accepted higher-seeder entries", () => {
  const left = {
    download_action: { Reject: { reason: "no quality improvement" } },
    indexer: "Nyaa",
    info_hash: "a",
    leechers: 1,
    link: "magnet:?a",
    publish_date: new Date().toISOString(),
    quality: "720p",
    seeders: 10,
    size: 100,
    title: "left",
  };
  const right = {
    download_action: {
      Accept: {
        is_seadex: false,
        quality: parseQualityFromTitle("1080p"),
        score: 10,
      },
    },
    indexer: "Nyaa",
    info_hash: "b",
    leechers: 1,
    link: "magnet:?b",
    publish_date: new Date().toISOString(),
    quality: "1080p",
    seeders: 5,
    size: 100,
    title: "right",
  };

  assertEquals(Math.sign(compareEpisodeSearchResults(left, right)), 1);
});

Deno.test("episode parser handles sxxexx and dash patterns", () => {
  assertEquals(parseEpisodeFromTitle("Show.S01E07.1080p.WEB.mkv"), 7);
  assertEquals(parseEpisodeFromTitle("[Group] Show - 12 [1080p]"), 12);
});

Deno.test("episode parser handles ranges and season packs", () => {
  assertEquals(parseEpisodeNumbersFromTitle("[Group] Show - 01-03 [1080p]"), [
    1,
    2,
    3,
  ]);
  assertEquals(parseEpisodeNumbersFromTitle("Show S01E01-E04 1080p"), [
    1,
    2,
    3,
    4,
  ]);

  const parsed = parseReleaseName("[Group] Show - 01-12 Batch [1080p]");
  assertEquals(parsed.isBatch, true);
  assertEquals(parsed.episodeNumbers.length, 12);
});
