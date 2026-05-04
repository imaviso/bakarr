import { assert, it } from "@effect/vitest";

import { anime } from "@/db/schema.ts";
import {
  analyzeScannedFile,
  findBestLocalAnimeMatch,
  scoreAnimeRowMatch,
  titlesMatch,
} from "@/features/operations/library-import-analysis-support.ts";

type AnimeRow = typeof anime.$inferSelect;

function animeRow(input: Pick<AnimeRow, "id" | "titleRomaji"> & Partial<AnimeRow>): AnimeRow {
  const row: AnimeRow = {
    addedAt: "2025-01-01T00:00:00.000Z",
    bannerImage: null,
    background: null,
    coverImage: null,
    description: null,
    duration: null,
    endDate: null,
    endYear: null,
    episodeCount: null,
    favorites: null,
    format: "TV",
    genres: "[]",
    id: input.id,
    malId: null,
    members: null,
    monitored: true,
    nextAiringAt: null,
    nextAiringEpisode: null,
    popularity: null,
    profileName: "Default",
    rank: null,
    rating: null,
    recommendedAnime: null,
    relatedAnime: null,
    releaseProfileIds: "[]",
    rootFolder: `/library/${input.titleRomaji}`,
    score: null,
    source: null,
    startDate: null,
    startYear: null,
    status: "RELEASING",
    synonyms: null,
    studios: "[]",
    titleEnglish: null,
    titleNative: null,
    titleRomaji: input.titleRomaji,
  };

  return { ...row, ...input };
}

it("analyzeScannedFile marks daily identities as requiring manual mapping", () => {
  const result = analyzeScannedFile({
    name: "Show.2025-03-14.1080p.mkv",
    path: "/library/Show.2025-03-14.1080p.mkv",
  });

  assert.deepStrictEqual(result.scanned.air_date, "2025-03-14");
  assert.deepStrictEqual(result.scanned.needs_manual_mapping, true);
  assert.deepStrictEqual(
    result.scanned.match_reason,
    "Parsed a daily air date from the filename; choose the episode mapping before import",
  );
});

it("scoreAnimeRowMatch and titlesMatch share normalized title scoring", () => {
  assert.deepStrictEqual(
    scoreAnimeRowMatch(
      "Dungeon Meshi",
      animeRow({ id: 1, titleEnglish: "Delicious in Dungeon", titleRomaji: "Dungeon Meshi" }),
    ),
    1,
  );
  assert.deepStrictEqual(
    titlesMatch("Dungeon Meshi", {
      id: 1,
      already_in_library: false,
      cover_image: undefined,
      description: undefined,
      episode_count: undefined,
      format: "TV",
      start_date: undefined,
      status: "FINISHED",
      synonyms: [],
      title: { english: "Delicious in Dungeon", native: undefined, romaji: "Dungeon Meshi" },
    }),
    true,
  );
});

it("findBestLocalAnimeMatch returns only matches above confidence threshold", () => {
  const rows = [
    animeRow({ id: 1, titleRomaji: "Unrelated Show" }),
    animeRow({ id: 2, titleEnglish: "Delicious in Dungeon", titleRomaji: "Dungeon Meshi" }),
  ];

  assert.deepStrictEqual(findBestLocalAnimeMatch("Dungeon Meshi", rows)?.id, 2);
  assert.deepStrictEqual(findBestLocalAnimeMatch("Completely Different", rows), undefined);
});
