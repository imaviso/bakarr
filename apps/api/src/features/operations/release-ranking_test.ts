import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { Effect, Either } from "effect";

import { defaultAppConfig } from "@/config.ts";
import type { Config, QualityProfile } from "@packages/shared/index.ts";
import {
  compareEpisodeSearchResults,
  decideDownloadAction,
  parseEpisodeFromTitle,
  parseEpisodeNumbersFromTitle,
  parseQualityFromTitle,
  parseReleaseName,
  validateQualityProfileSizeLabels,
} from "@/features/operations/release-ranking.ts";

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

it("parse release name extracts group, episode, and quality", () => {
  const parsed = parseReleaseName("[SubsPlease] Frieren - 05 (1080p) [WEB-DL]");

  assert.deepStrictEqual(parsed.group, "SubsPlease");
  assert.deepStrictEqual(parsed.episodeNumber, 5);
  assert.deepStrictEqual(parsed.resolution, "1080p");
  assert.deepStrictEqual(parsed.quality.name, "WEB-DL 1080p");
});

it("parse quality prefers bluray remux over webdl", () => {
  assert.deepStrictEqual(
    parseQualityFromTitle("[Group] Show - 01 [1080p BluRay]").name,
    "BluRay 1080p",
  );
  assert.deepStrictEqual(
    parseQualityFromTitle("[Group] Show - 01 [1080p Remux]").name,
    "BluRay 1080p Remux",
  );
  assert.deepStrictEqual(
    parseQualityFromTitle("[Group] Show S01 (BD 1080p HEVC Opus) [Dual-Audio]").name,
    "BluRay 1080p",
  );
});

it("parse quality falls back to Unknown when no source and no resolution exist", () => {
  assert.deepStrictEqual(parseQualityFromTitle("unknown").name, "Unknown");
});

it("decide download accepts new release and upgrades higher quality", () => {
  const accepted = decideDownloadAction(
    baseProfile,
    [],
    null,
    {
      group: "SubsPlease",
      isSeaDex: false,
      isSeaDexBest: false,
      remake: false,
      seeders: 50,
      sizeBytes: 1024 ** 3,
      title: "[SubsPlease] Show - 01 (1080p)",
      trusted: true,
    },
    baseConfig,
  );

  assert.deepStrictEqual(Boolean(accepted.Accept), true);

  const upgraded = decideDownloadAction(
    baseProfile,
    [],
    {
      downloaded: true,
      filePath: "[Group] Show - 01 [720p WEB-DL].mkv",
      isSeaDex: false,
      isSeaDexBest: false,
    },
    {
      group: "SubsPlease",
      isSeaDex: false,
      isSeaDexBest: false,
      remake: false,
      seeders: 50,
      sizeBytes: 1024 ** 3,
      title: "[SubsPlease] Show - 01 [1080p BluRay]",
      trusted: true,
    },
    baseConfig,
  );

  assert.deepStrictEqual(Boolean(upgraded.Upgrade), true);
});

it("seadex release can upgrade same-quality current file", () => {
  const decision = decideDownloadAction(
    baseProfile,
    [],
    {
      downloaded: true,
      filePath: "[Group] Show - 01 [1080p WEB-DL].mkv",
      isSeaDex: false,
      isSeaDexBest: false,
    },
    {
      group: "SubsPlease",
      isSeaDex: true,
      isSeaDexBest: true,
      remake: false,
      seeders: 30,
      sizeBytes: 1024 ** 3,
      title: "[SubsPlease] Show - 01 [1080p WEB-DL]",
      trusted: true,
    },
    baseConfig,
  );

  assert.deepStrictEqual(Boolean(decision.Upgrade), true);
  assert.deepStrictEqual(decision.Upgrade?.is_seadex_best, true);
});

it("seadex scoring is disabled when runtime config disables seadex", () => {
  const decision = decideDownloadAction(
    baseProfile,
    [],
    {
      downloaded: true,
      filePath: "[Group] Show - 01 [1080p WEB-DL].mkv",
      isSeaDex: false,
      isSeaDexBest: false,
    },
    {
      group: "SubsPlease",
      isSeaDex: true,
      isSeaDexBest: true,
      remake: false,
      seeders: 30,
      sizeBytes: 1024 ** 3,
      title: "[SubsPlease] Show - 01 [1080p WEB-DL]",
      trusted: true,
    },
    {
      ...baseConfig,
      downloads: {
        ...baseConfig.downloads,
        use_seadex: false,
      },
    },
  );

  assert.deepStrictEqual(decision.Reject?.reason, "already at quality cutoff");
});

it("seadex tags and config preferences boost release score", () => {
  const preferred = decideDownloadAction(
    baseProfile,
    [],
    null,
    {
      group: "OtherGroup",
      isSeaDex: true,
      isSeaDexBest: false,
      remake: false,
      seaDexDualAudio: true,
      seaDexNotes: "Recommended encode",
      seaDexTags: ["Best"],
      seeders: 0,
      sizeBytes: 800 * 1024 * 1024,
      title: "[OtherGroup] Show - 01 [720p WEB-DL HEVC] [Dual Audio]",
      trusted: false,
    },
    {
      ...baseConfig,
      downloads: {
        ...baseConfig.downloads,
        prefer_dual_audio: true,
        preferred_codec: "hevc",
        preferred_groups: [],
      },
      nyaa: {
        ...baseConfig.nyaa,
        preferred_resolution: "720p",
      },
    },
  );
  const fallback = decideDownloadAction(
    baseProfile,
    [],
    null,
    {
      group: "OtherGroup",
      isSeaDex: true,
      isSeaDexBest: false,
      remake: false,
      seaDexDualAudio: false,
      seaDexNotes: "Fallback option",
      seaDexTags: ["Alt"],
      seeders: 0,
      sizeBytes: 800 * 1024 * 1024,
      title: "[OtherGroup] Show - 01 [720p WEB-DL x264]",
      trusted: false,
    },
    {
      ...baseConfig,
      downloads: {
        ...baseConfig.downloads,
        prefer_dual_audio: true,
        preferred_codec: "hevc",
        preferred_groups: [],
      },
      nyaa: {
        ...baseConfig.nyaa,
        preferred_resolution: "720p",
      },
    },
  );

  assert.deepStrictEqual(Boolean(preferred.Accept), true);
  assert.deepStrictEqual(Boolean(fallback.Accept), true);
  assert.deepStrictEqual((preferred.Accept?.score ?? 0) > (fallback.Accept?.score ?? 0), true);
});

it("negative SeaDex notes can reduce release score", () => {
  const recommended = decideDownloadAction(
    baseProfile,
    [],
    null,
    {
      group: "OtherGroup",
      isSeaDex: true,
      isSeaDexBest: false,
      remake: false,
      seaDexNotes: "Recommended release",
      seaDexTags: ["Best"],
      seeders: 0,
      sizeBytes: 800 * 1024 * 1024,
      title: "[OtherGroup] Show - 01 [720p WEB-DL]",
      trusted: false,
    },
    {
      ...baseConfig,
      downloads: {
        ...baseConfig.downloads,
        preferred_groups: [],
      },
      nyaa: {
        ...baseConfig.nyaa,
        preferred_resolution: "720p",
      },
    },
  );
  const problematic = decideDownloadAction(
    baseProfile,
    [],
    null,
    {
      group: "OtherGroup",
      isSeaDex: true,
      isSeaDexBest: false,
      remake: false,
      seaDexNotes: "Avoid this release - audio desync issue",
      seaDexTags: ["Best"],
      seeders: 0,
      sizeBytes: 800 * 1024 * 1024,
      title: "[OtherGroup] Show - 01 [720p WEB-DL]",
      trusted: false,
    },
    {
      ...baseConfig,
      downloads: {
        ...baseConfig.downloads,
        preferred_groups: [],
      },
      nyaa: {
        ...baseConfig.nyaa,
        preferred_resolution: "720p",
      },
    },
  );

  assert.deepStrictEqual(Boolean(recommended.Accept), true);
  assert.deepStrictEqual(Boolean(problematic.Accept), true);
  assert.deepStrictEqual((recommended.Accept?.score ?? 0) > (problematic.Accept?.score ?? 0), true);
});

it("SeaDex best metadata outranks high-seeder non-SeaDex releases", () => {
  const seadex = decideDownloadAction(
    baseProfile,
    [],
    null,
    {
      group: "sam",
      isSeaDex: true,
      isSeaDexBest: true,
      remake: false,
      seaDexNotes: "sam recommended release",
      seaDexTags: ["Best"],
      seeders: 2,
      sizeBytes: 1024 ** 3,
      title: "[sam] Show - 01 [1080p BluRay]",
      trusted: false,
    },
    {
      ...baseConfig,
      downloads: {
        ...baseConfig.downloads,
        preferred_groups: [],
      },
    },
  );
  const popular = decideDownloadAction(
    baseProfile,
    [],
    null,
    {
      group: "Judas",
      isSeaDex: false,
      isSeaDexBest: false,
      remake: false,
      seeders: 500,
      sizeBytes: 1024 ** 3,
      title: "[Judas] Show - 01 [1080p BluRay]",
      trusted: true,
    },
    {
      ...baseConfig,
      downloads: {
        ...baseConfig.downloads,
        preferred_groups: [],
      },
    },
  );

  assert.deepStrictEqual(Boolean(seadex.Accept), true);
  assert.deepStrictEqual(Boolean(popular.Accept), true);
  assert.deepStrictEqual((seadex.Accept?.score ?? 0) > (popular.Accept?.score ?? 0), true);
});

it("SeaDex notes mentioning the release group boost the matching release", () => {
  const matched = decideDownloadAction(
    baseProfile,
    [],
    null,
    {
      group: "ABdex",
      isSeaDex: true,
      isSeaDexBest: false,
      remake: false,
      seaDexNotes: "ABdex release",
      seaDexTags: ["Alt"],
      seeders: 0,
      sizeBytes: 900 * 1024 * 1024,
      title: "[ABdex] Show - 01 [1080p WEB-DL]",
      trusted: false,
    },
    {
      ...baseConfig,
      downloads: {
        ...baseConfig.downloads,
        preferred_groups: [],
      },
    },
  );
  const unmatched = decideDownloadAction(
    baseProfile,
    [],
    null,
    {
      group: "LostYears",
      isSeaDex: true,
      isSeaDexBest: false,
      remake: false,
      seaDexNotes: "ABdex release",
      seaDexTags: ["Alt"],
      seeders: 0,
      sizeBytes: 900 * 1024 * 1024,
      title: "[LostYears] Show - 01 [1080p WEB-DL]",
      trusted: false,
    },
    {
      ...baseConfig,
      downloads: {
        ...baseConfig.downloads,
        preferred_groups: [],
      },
    },
  );

  assert.deepStrictEqual(Boolean(matched.Accept), true);
  assert.deepStrictEqual(Boolean(unmatched.Accept), true);
  assert.deepStrictEqual((matched.Accept?.score ?? 0) > (unmatched.Accept?.score ?? 0), true);
});

it("compare episode search results prefers higher scores before seeders", () => {
  const lowerScoreMoreSeeders = {
    download_action: {
      Accept: {
        is_seadex: false,
        quality: parseQualityFromTitle("1080p"),
        score: 5,
      },
    },
    indexer: "Nyaa",
    info_hash: "a",
    leechers: 1,
    link: "magnet:?a",
    publish_date: new Date().toISOString(),
    quality: "1080p",
    seeders: 100,
    size: 100,
    title: "left",
  };
  const higherScoreFewerSeeders = {
    download_action: {
      Accept: {
        is_seadex: true,
        is_seadex_best: true,
        quality: parseQualityFromTitle("1080p"),
        score: 25,
      },
    },
    indexer: "Nyaa",
    info_hash: "b",
    leechers: 1,
    link: "magnet:?b",
    publish_date: new Date().toISOString(),
    quality: "1080p",
    seeders: 2,
    size: 100,
    title: "right",
  };

  assert.deepStrictEqual(
    Math.sign(compareEpisodeSearchResults(lowerScoreMoreSeeders, higherScoreFewerSeeders)),
    1,
  );
});

it("compare episode search results prefers accepted higher-seeder entries", () => {
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

  assert.deepStrictEqual(Math.sign(compareEpisodeSearchResults(left, right)), 1);
});

it("cutoff blocks better-quality upgrades once cutoff is met", () => {
  const profileWith4kAllowed: QualityProfile = {
    ...baseProfile,
    allowed_qualities: ["2160p", "1080p", "720p"],
  };

  const decision = decideDownloadAction(
    profileWith4kAllowed,
    [],
    {
      downloaded: true,
      filePath: "[Group] Show - 01 [1080p WEB-DL].mkv",
      isSeaDex: false,
      isSeaDexBest: false,
    },
    {
      group: "SubsPlease",
      isSeaDex: false,
      isSeaDexBest: false,
      remake: false,
      seeders: 50,
      sizeBytes: 1024 ** 3,
      title: "[SubsPlease] Show - 01 [2160p BluRay]",
      trusted: true,
    },
    baseConfig,
  );

  assert.deepStrictEqual(decision.Reject?.reason, "already at quality cutoff");
});

it("unknown current quality does not block higher-quality upgrade", () => {
  const decision = decideDownloadAction(
    {
      ...baseProfile,
      allowed_qualities: ["2160p", "1080p", "720p"],
    },
    [],
    {
      downloaded: true,
      filePath: "Show Episode 01",
      isSeaDex: false,
      isSeaDexBest: false,
    },
    {
      group: "SubsPlease",
      isSeaDex: false,
      isSeaDexBest: false,
      remake: false,
      seeders: 50,
      sizeBytes: 1024 ** 3,
      title: "[SubsPlease] Show - 01 [1080p BluRay]",
      trusted: true,
    },
    baseConfig,
  );

  assert.deepStrictEqual(decision.Upgrade?.reason, "better quality available");
  assert.deepStrictEqual(
    decision.Upgrade?.quality.name,
    parseQualityFromTitle("1080p BluRay").name,
  );
});

it.effect("invalid quality profile size labels fail validation", () =>
  Effect.gen(function* () {
    const result = yield* validateQualityProfileSizeLabels({
      ...baseProfile,
      min_size: "not-a-size",
    }).pipe(Effect.either);

    assert.deepStrictEqual(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assert.deepStrictEqual(result.left.message, "Invalid quality profile size label: not-a-size");
    }
  }),
);

it("compare episode search results prefers better quality over seeders when score ties", () => {
  const lowQualityMoreSeeders = {
    download_action: {
      Accept: {
        is_seadex: false,
        quality: parseQualityFromTitle("480p SDTV"),
        score: 10,
      },
    },
    indexer: "Nyaa",
    info_hash: "a",
    leechers: 1,
    link: "magnet:?a",
    publish_date: new Date().toISOString(),
    quality: "480p",
    seeders: 100,
    size: 100,
    title: "left",
  };

  const highQualityFewerSeeders = {
    download_action: {
      Accept: {
        is_seadex: false,
        quality: parseQualityFromTitle("1080p BluRay"),
        score: 10,
      },
    },
    indexer: "Nyaa",
    info_hash: "b",
    leechers: 1,
    link: "magnet:?b",
    publish_date: new Date().toISOString(),
    quality: "1080p",
    seeders: 2,
    size: 100,
    title: "right",
  };

  assert.deepStrictEqual(
    Math.sign(compareEpisodeSearchResults(lowQualityMoreSeeders, highQualityFewerSeeders)),
    1,
  );
});

it("episode parser handles sxxexx and dash patterns", () => {
  assert.deepStrictEqual(parseEpisodeFromTitle("Show.S01E07.1080p.WEB.mkv"), 7);
  assert.deepStrictEqual(parseEpisodeFromTitle("[Group] Show - 12 [1080p]"), 12);
});

it("episode parser handles ranges and season packs", () => {
  assert.deepStrictEqual(parseEpisodeNumbersFromTitle("[Group] Show - 01-03 [1080p]"), [1, 2, 3]);
  assert.deepStrictEqual(parseEpisodeNumbersFromTitle("Show S01E01-E04 1080p"), [1, 2, 3, 4]);

  const parsed = parseReleaseName("[Group] Show - 01-12 Batch [1080p]");
  assert.deepStrictEqual(parsed.isBatch, true);
  assert.deepStrictEqual(parsed.episodeNumbers.length, 12);

  const seasonPack = parseReleaseName(
    "[Flugel] Chainsaw Man S01 (BD 1080p HEVC Opus) [Multi Audio]",
  );
  assert.deepStrictEqual(seasonPack.isBatch, true);
  assert.deepStrictEqual(seasonPack.episodeNumbers, []);
});
