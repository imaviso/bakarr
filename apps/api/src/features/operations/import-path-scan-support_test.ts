import { assertEquals } from "@std/assert";

import {
  buildEpisodeFileMappingIndex,
  buildScannedFileLibrarySignals,
  buildScannedFileNamingPlan,
} from "./import-path-scan-support.ts";

Deno.test("buildScannedFileLibrarySignals reports existing exact-path mappings", () => {
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

  assertEquals(
    buildScannedFileLibrarySignals({
      file: {
        episode_number: 1,
        episode_numbers: [1, 2],
        source_path: "/imports/Naruto - 01.mkv",
      },
      mappingIndex,
      targetAnime: { id: 20, title: "Naruto" },
    }),
    {
      existing_mapping: {
        anime_id: 20,
        anime_title: "Naruto",
        episode_numbers: [1, 2],
        file_path: "/imports/Naruto - 01.mkv",
      },
    },
  );
});

Deno.test("buildScannedFileLibrarySignals reports duplicate episode conflicts", () => {
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

  assertEquals(
    buildScannedFileLibrarySignals({
      file: {
        episode_number: 1,
        episode_numbers: [1, 2],
        source_path: "/imports/Naruto batch.mkv",
      },
      mappingIndex,
      targetAnime: { id: 20, title: "Naruto" },
    }),
    {
      episode_conflict: {
        anime_id: 20,
        anime_title: "Naruto",
        episode_numbers: [1, 2],
        file_path: "/library/Naruto/Naruto - 01.mkv",
      },
      existing_mapping: undefined,
    },
  );
});

Deno.test("buildScannedFileNamingPlan exposes naming details for matched anime files", () => {
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
      namingFormat:
        "{title} - S{season:02}E{episode:02} [{quality} {resolution}]",
      preferredTitle: "romaji",
    },
  });

  assertEquals(result.naming_fallback_used, undefined);
  assertEquals(result.naming_filename, "Naruto - S01E01 [WEB-DL 1080p].mkv");
  assertEquals(
    result.naming_format_used,
    "{title} - S{season:02}E{episode:02} [{quality} {resolution}]",
  );
  assertEquals(
    result.naming_metadata_snapshot?.episode_title,
    "Enter Naruto Uzumaki!",
  );
  assertEquals(
    result.naming_metadata_snapshot?.title_source,
    "preferred_romaji",
  );
});
