import { assertEquals } from "@std/assert";

import { parseEpisodeNumber, parseEpisodeNumbers } from "./episode-parser.ts";

Deno.test("parseEpisodeNumber handles common Sonarr and Plex formats", () => {
  assertEquals(
    parseEpisodeNumber(
      "Rock Is a Lady's Modesty (2025) - S01E01 - Good Day to You♡ Quit Playing the Guitar!!! [v2 WEBDL-1080p Proper][AAC 2.0][AVC]-SubsPlus+.mkv",
    ),
    1,
  );
  assertEquals(parseEpisodeNumber("Show.Name.S01E07.1080p.WEB-DL.mkv"), 7);
  assertEquals(parseEpisodeNumber("Show Name - 1x02 - Episode Title.mkv"), 2);
  assertEquals(
    parseEpisodeNumber("Show Name - Season 1 Episode 3 - Episode Title.mkv"),
    3,
  );
  assertEquals(parseEpisodeNumber("[Group] Show - 12 [1080p].mkv"), 12);
});

Deno.test("parseEpisodeNumbers handles common multi-episode local formats", () => {
  assertEquals(parseEpisodeNumbers("Show.Name.S01E01-E02.1080p.WEB-DL.mkv"), [
    1,
    2,
  ]);
  assertEquals(parseEpisodeNumbers("Show Name - 1x01-1x02 - Title.mkv"), [
    1,
    2,
  ]);
  assertEquals(parseEpisodeNumbers("Show Name - 1x01-02 - Title.mkv"), [1, 2]);
  assertEquals(parseEpisodeNumbers("[Group] Show - 03-04 [1080p].mkv"), [3, 4]);
});
