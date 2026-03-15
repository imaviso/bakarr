import { assertEquals } from "@std/assert";

import {
  analyzeScannedFile,
  findBestLocalAnimeMatch,
  titlesMatch,
  toAnimeSearchCandidate,
} from "./library-import.ts";
import { anime } from "../../db/schema.ts";

Deno.test("analyzeScannedFile strips release noise and extracts metadata", () => {
  const parsed = analyzeScannedFile({
    name: "[SubsPlease] Naruto Season 2 - 03 [1080p] [HEVC].mkv",
    path: "/library/Naruto - 03.mkv",
  });

  assertEquals(parsed.episode_number, 3);
  assertEquals(parsed.group, "SubsPlease");
  assertEquals(parsed.parsed_title, "Naruto Season");
  assertEquals(parsed.resolution, "1080p");
  assertEquals(parsed.season, 2);
});

Deno.test("analyzeScannedFile handles Sonarr and Plex style episode names", () => {
  const parsed = analyzeScannedFile({
    name:
      "Rock Is a Lady's Modesty (2025) - S01E01 - Good Day to You♡ Quit Playing the Guitar!!! [v2 WEBDL-1080p Proper][AAC 2.0][AVC]-SubsPlus+.mkv",
    path:
      "/library/Rock Is a Lady's Modesty (2025) - S01E01 - Good Day to You♡ Quit Playing the Guitar!!! [v2 WEBDL-1080p Proper][AAC 2.0][AVC]-SubsPlus+.mkv",
  });

  assertEquals(parsed.episode_number, 1);
  assertEquals(parsed.parsed_title, "Rock Is a Lady's Modesty (2025)");
  assertEquals(parsed.resolution, "1080p");
  assertEquals(parsed.season, 1);
});

Deno.test("analyzeScannedFile preserves multi-episode local ranges", () => {
  const parsed = analyzeScannedFile({
    name: "Show Name - 1x01-1x02 - Premiere.mkv",
    path: "/library/Show Name - 1x01-1x02 - Premiere.mkv",
  });

  assertEquals(parsed.episode_number, 1);
  assertEquals(parsed.episode_numbers, [1, 2]);
  assertEquals(parsed.parsed_title, "Show Name");
  assertEquals(parsed.season, 1);
});

Deno.test("findBestLocalAnimeMatch handles title normalization and rejects weak matches", () => {
  const naruto = makeAnimeRow({
    addedAt: "2024-01-01T00:00:00.000Z",
    bannerImage: null,
    coverImage: null,
    description: null,
    endDate: null,
    episodeCount: 24,
    format: "TV",
    genres: "Action",
    id: 20,
    malId: null,
    monitored: true,
    profileName: "Default",
    releaseProfileIds: "[]",
    rootFolder: "/library/Naruto II",
    score: null,
    startDate: null,
    status: "RELEASING",
    studios: "Studio Pierrot",
    titleEnglish: "Naruto Season 2",
    titleNative: null,
    titleRomaji: "Naruto II",
  });
  const bleach = makeAnimeRow({
    ...naruto,
    id: 21,
    rootFolder: "/library/Bleach",
    titleEnglish: "Bleach",
    titleRomaji: "Bleach",
  });

  assertEquals(
    findBestLocalAnimeMatch("Naruto Season 2", [naruto, bleach])?.id,
    20,
  );
  assertEquals(
    findBestLocalAnimeMatch("Completely Different Show", [naruto, bleach]),
    undefined,
  );
});

Deno.test("titlesMatch checks normalized candidate titles", () => {
  const candidate = toAnimeSearchCandidate(makeAnimeRow({
    addedAt: "2024-01-01T00:00:00.000Z",
    bannerImage: null,
    coverImage: null,
    description: null,
    endDate: null,
    episodeCount: 12,
    format: "TV",
    genres: "Action",
    id: 30,
    malId: null,
    monitored: true,
    profileName: "Default",
    releaseProfileIds: "[]",
    rootFolder: "/library/My Hero Academia",
    score: null,
    startDate: null,
    status: "FINISHED",
    studios: "Bones",
    titleEnglish: "My Hero Academia Season 2",
    titleNative: "Boku no Hero Academia 2",
    titleRomaji: "Boku no Hero Academia II",
  }));

  assertEquals(titlesMatch("My Hero Academia 2", candidate), true);
  assertEquals(titlesMatch("One Piece", candidate), false);
});

function makeAnimeRow(
  overrides: Partial<typeof anime.$inferSelect>,
): typeof anime.$inferSelect {
  return {
    addedAt: "2024-01-01T00:00:00.000Z",
    bannerImage: null,
    coverImage: null,
    description: null,
    endDate: null,
    episodeCount: 12,
    format: "TV",
    genres: "Action",
    id: 1,
    malId: null,
    monitored: true,
    profileName: "Default",
    releaseProfileIds: "[]",
    rootFolder: "/library/Anime",
    score: null,
    startDate: null,
    status: "FINISHED",
    studios: "Studio",
    titleEnglish: null,
    titleNative: null,
    titleRomaji: "Anime",
    ...overrides,
  };
}
