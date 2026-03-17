import { assertEquals } from "@std/assert";

import { buildEpisodeNamingInputFromPath } from "./naming-support.ts";

Deno.test("buildEpisodeNamingInputFromPath extracts local filename metadata for rename tokens", () => {
  const input = buildEpisodeNamingInputFromPath({
    animeStartDate: "2012-01-08",
    animeTitle: "Nisemonogatari",
    episodeNumbers: [1],
    filePath:
      "/mnt/media2/Shows/Nisemonogatari (2012)/Season 1/Nisemonogatari - S01E01 - Karen Bee, Part 1 -[1920x1080]-[hevc]-[aac][MTBB].mkv",
    rootFolder: "/mnt/media2/Shows/Nisemonogatari (2012)",
  });

  assertEquals(input.episodeTitle, "Karen Bee, Part 1");
  assertEquals(input.group, "MTBB");
  assertEquals(input.quality, undefined);
  assertEquals(input.resolution, "1080p");
  assertEquals(input.season, 1);
  assertEquals(input.videoCodec, "HEVC");
  assertEquals(input.audioCodec, "AAC");
  assertEquals(input.audioChannels, undefined);
  assertEquals(input.year, 2012);
});

Deno.test("buildEpisodeNamingInputFromPath keeps stored episode title over filename fallback", () => {
  const input = buildEpisodeNamingInputFromPath({
    animeTitle: "Show Name",
    episodeNumbers: [1],
    episodeTitle: "Canonical Episode Title",
    filePath: "/library/Show Name - S01E01 - Source Episode Title [1080p].mkv",
  });

  assertEquals(input.episodeTitle, "Canonical Episode Title");
});
