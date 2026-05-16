import { assert, it } from "@effect/vitest";
import { brandAnimeId } from "@packages/shared/index.ts";

import {
  buildEpisodeFileMappingIndex,
  buildScannedFileLibrarySignals,
} from "@/features/operations/import-scan/import-path-scan-mapping-support.ts";
import { buildScannedFileNamingPlan } from "@/features/operations/import-scan/import-path-scan-naming-support.ts";

it("buildScannedFileLibrarySignals reports existing exact-path mappings", () => {
  const mappingIndex = buildEpisodeFileMappingIndex([
    {
      anime_id: 20,
      anime_title: "Naruto",
      episode_number: 1,
      file_path: "/imports/Naruto - 01.mkv",
    },
    {
      anime_id: 20,
      anime_title: "Naruto",
      episode_number: 2,
      file_path: "/imports/Naruto - 01.mkv",
    },
  ]);

  assert.deepStrictEqual(
    buildScannedFileLibrarySignals({
      file: {
        episode_number: 1,
        episode_numbers: [1, 2],
        source_path: "/imports/Naruto - 01.mkv",
      },
      mappingIndex,
      targetAnime: { id: brandAnimeId(20), title: "Naruto" },
    }),
    {
      existing_mapping: {
        anime_id: brandAnimeId(20),
        anime_title: "Naruto",
        episode_numbers: [1, 2],
        file_path: "/imports/Naruto - 01.mkv",
      },
    },
  );
});

it("buildScannedFileLibrarySignals reports duplicate episode conflicts", () => {
  const mappingIndex = buildEpisodeFileMappingIndex([
    {
      anime_id: 20,
      anime_title: "Naruto",
      episode_number: 1,
      file_path: "/library/Naruto/Naruto - 01.mkv",
    },
    {
      anime_id: 20,
      anime_title: "Naruto",
      episode_number: 2,
      file_path: "/library/Naruto/Naruto - 02.mkv",
    },
  ]);

  assert.deepStrictEqual(
    buildScannedFileLibrarySignals({
      file: {
        episode_number: 1,
        episode_numbers: [1, 2],
        source_path: "/imports/Naruto batch.mkv",
      },
      mappingIndex,
      targetAnime: { id: brandAnimeId(20), title: "Naruto" },
    }),
    {
      episode_conflict: {
        anime_id: brandAnimeId(20),
        anime_title: "Naruto",
        episode_numbers: [1, 2],
        file_path: "/library/Naruto/Naruto - 01.mkv",
      },
      existing_mapping: undefined,
    },
  );
});

it("buildScannedFileNamingPlan exposes naming details for matched anime files", () => {
  const result = buildScannedFileNamingPlan({
    animeRow: {
      format: "TV",
      rootFolder: "/library/Naruto",
      startDate: "2024-01-01",
      startYear: 2024,
      titleRomaji: "Naruto",
    },
    episodeRows: [{ aired: "2024-01-01", title: "Enter Naruto Uzumaki!" }],
    file: {
      audio_channels: "2.0",
      audio_codec: "AAC",
      episode_number: 1,
      group: "SubsPlease",
      quality: "WEB-DL",
      resolution: "1080p",
      season: 1,
      source_path: "/imports/Naruto - S01E01.mkv",
      source_identity: {
        episode_numbers: [1],
        label: "S01E01",
        scheme: "season",
        season: 1,
      },
      video_codec: "HEVC",
    },
    namingSettings: {
      movieNamingFormat: "{title} ({year})",
      namingFormat: "{title} - S{season:02}E{episode:02} [{quality} {resolution}]",
      preferredTitle: "romaji",
    },
  });

  assert.deepStrictEqual(result.naming_fallback_used, undefined);
  assert.deepStrictEqual(result.naming_filename, "Naruto - S01E01 [WEB-DL 1080p].mkv");
  assert.deepStrictEqual(
    result.naming_format_used,
    "{title} - S{season:02}E{episode:02} [{quality} {resolution}]",
  );
  assert.deepStrictEqual(result.naming_metadata_snapshot?.episode_title, "Enter Naruto Uzumaki!");
  assert.deepStrictEqual(result.naming_metadata_snapshot?.title_source, "preferred_romaji");
});

it("buildScannedFileNamingPlan avoids duplicate resolution when quality already includes it", () => {
  const result = buildScannedFileNamingPlan({
    animeRow: {
      format: "TV",
      rootFolder: "/library/Jigokuraku",
      startDate: "2023-04-01",
      startYear: 2023,
      titleRomaji: "Jigokuraku",
    },
    episodeRows: [{ aired: "2023-04-01", title: "Hell and Paradise" }],
    file: {
      audio_channels: "2.0",
      audio_codec: "Opus",
      episode_number: 1,
      group: "Vodes",
      quality: "WEB-DL 1080p",
      resolution: "1080p",
      season: 1,
      source_path: "/imports/Jigokuraku - S01E01 v2 (BD 1080p HEVC) [Vodes].mkv",
      source_identity: {
        episode_numbers: [1],
        label: "S01E01",
        scheme: "season",
        season: 1,
      },
      video_codec: "HEVC",
    },
    namingSettings: {
      movieNamingFormat: "{title} ({year})",
      namingFormat: "{title} - S{season:02}E{episode:02} [{quality} {resolution}]",
      preferredTitle: "romaji",
    },
  });

  assert.deepStrictEqual(result.naming_filename, "Jigokuraku - S01E01 [WEB-DL 1080p].mkv");
});

it("buildScannedFileNamingPlan keeps extension logic within file basename", () => {
  const result = buildScannedFileNamingPlan({
    animeRow: {
      format: "TV",
      rootFolder: "/library/Test",
      startDate: "2024-01-01",
      startYear: 2024,
      titleRomaji: "Test",
    },
    episodeRows: [{ aired: "2024-01-01", title: "Episode" }],
    file: {
      audio_channels: "2.0",
      audio_codec: "AAC",
      episode_number: 1,
      group: "Group",
      quality: "WEB-DL",
      resolution: "1080p",
      season: 1,
      source_path: "/imports.v2/Test - S01E01",
      source_identity: {
        episode_numbers: [1],
        label: "S01E01",
        scheme: "season",
        season: 1,
      },
      video_codec: "HEVC",
    },
    namingSettings: {
      movieNamingFormat: "{title} ({year})",
      namingFormat: "{title} - S{season:02}E{episode:02}",
      preferredTitle: "romaji",
    },
  });

  assert.deepStrictEqual(result.naming_filename, "Test - S01E01.mkv");
});
