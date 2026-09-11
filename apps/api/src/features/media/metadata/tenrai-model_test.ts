import { assert, it } from "@effect/vitest";

import {
  mapTenraiFormatToAniListFormat,
  mapTenraiStatusToAniListStatus,
  scaleTenraiScoreToAniList,
  tenraiAnimeToMetadata,
  tenraiSeasonalEntryToSearchResult,
  type TenraiNormalizedAnime,
  type TenraiNormalizedSeasonalEntry,
} from "@/features/media/metadata/tenrai-model.ts";

it("maps Tenrai statuses to AniList statuses", () => {
  assert.deepStrictEqual(mapTenraiStatusToAniListStatus("Finished Airing"), "FINISHED");
  assert.deepStrictEqual(mapTenraiStatusToAniListStatus("Currently Airing"), "RELEASING");
  assert.deepStrictEqual(mapTenraiStatusToAniListStatus("Not yet aired"), "NOT_YET_RELEASED");
  assert.deepStrictEqual(mapTenraiStatusToAniListStatus(undefined), "UNKNOWN");
  assert.deepStrictEqual(mapTenraiStatusToAniListStatus("Unexpected"), "UNKNOWN");
});

it("maps Tenrai formats to AniList formats", () => {
  assert.deepStrictEqual(mapTenraiFormatToAniListFormat("TV"), "TV");
  assert.deepStrictEqual(mapTenraiFormatToAniListFormat("Movie"), "MOVIE");
  assert.deepStrictEqual(mapTenraiFormatToAniListFormat(undefined), "TV");
});

it("scales Tenrai scores like the merge helper", () => {
  assert.deepStrictEqual(scaleTenraiScoreToAniList(undefined), undefined);
  assert.deepStrictEqual(scaleTenraiScoreToAniList(9.1), 91);
  assert.deepStrictEqual(scaleTenraiScoreToAniList(10), 100);
});

it("converts Tenrai detail to AniList-shaped metadata with MAL-canonical id", () => {
  const metadata = tenraiAnimeToMetadata(
    makeNormalizedAnime({
      malId: 52991,
      score: 8.9,
      status: "Finished Airing",
    }),
  );

  assert.deepStrictEqual(metadata.id, 52991);
  assert.deepStrictEqual(metadata.malId, 52991);
  assert.deepStrictEqual(metadata.format, "TV");
  assert.deepStrictEqual(metadata.status, "FINISHED");
  assert.deepStrictEqual(metadata.score, 89);
  assert.deepStrictEqual(metadata.title.romaji, "Sousou no Frieren");
  assert.deepStrictEqual(metadata.coverImage, "https://cdn.example/52991.webp");
  assert.deepStrictEqual(metadata.genres, ["Adventure", "Drama"]);
  assert.deepStrictEqual(metadata.studios, ["Madhouse"]);
  assert.deepStrictEqual(metadata.synonyms, ["Frieren"]);
});

it("falls back to a MAL placeholder title when Tenrai titles are missing", () => {
  const metadata = tenraiAnimeToMetadata(makeNormalizedAnime({ malId: 77, title: {} }));

  assert.deepStrictEqual(metadata.title.romaji, "MAL 77");
});

it("converts seasonal entries to search results with MAL-canonical ids", () => {
  const result = tenraiSeasonalEntryToSearchResult(
    makeSeasonalEntry(101, { season: "spring", seasonYear: 2025, startYear: 2025 }),
    { season: "spring", year: 2025 },
  );

  assert.deepStrictEqual(result.id, 101);
  assert.deepStrictEqual(result.media_kind, "anime");
  assert.deepStrictEqual(result.format, "TV");
  assert.deepStrictEqual(result.status, "RELEASING");
  assert.deepStrictEqual(result.season, "spring");
  assert.deepStrictEqual(result.season_year, 2025);
  assert.deepStrictEqual(result.title.romaji, "Romaji 101");
});

it("fills missing seasonal fields from the requested window", () => {
  const result = tenraiSeasonalEntryToSearchResult(
    makeSeasonalEntry(404, { season: undefined, seasonYear: undefined, startYear: undefined }),
    { season: "fall", year: 2027 },
  );

  assert.deepStrictEqual(result.season, "fall");
  assert.deepStrictEqual(result.season_year, 2027);
  assert.deepStrictEqual(result.start_year, 2027);
});

it("leaves seasonal fields empty without entry data or fallback", () => {
  const result = tenraiSeasonalEntryToSearchResult(
    makeSeasonalEntry(405, { season: undefined, seasonYear: undefined, startYear: undefined }),
  );

  assert.deepStrictEqual(result.season, undefined);
  assert.deepStrictEqual(result.season_year, undefined);
});

function makeNormalizedAnime(overrides: Partial<TenraiNormalizedAnime>): TenraiNormalizedAnime {
  return {
    airing: false,
    approved: true,
    background: undefined,
    broadcast: {},
    demographics: [],
    duration: undefined,
    endDate: undefined,
    endYear: undefined,
    unitCount: 28,
    explicitGenres: [],
    favorites: undefined,
    format: "TV",
    genres: ["Adventure", "Drama"],
    images: {
      webp: { largeImageUrl: "https://cdn.example/52991.webp" },
    },
    licensors: [],
    malId: 52991,
    members: undefined,
    popularity: undefined,
    producers: [],
    rank: undefined,
    rating: undefined,
    recommendations: [],
    relations: [],
    score: undefined,
    scoredBy: undefined,
    season: undefined,
    source: undefined,
    startDate: undefined,
    startYear: undefined,
    status: undefined,
    studios: ["Madhouse"],
    synopsis: "An elf mage revisits old bonds.",
    themes: [],
    title: {
      english: "Frieren: Beyond Journey's End",
      native: "葬送のフリーレン",
      romaji: "Sousou no Frieren",
    },
    titleVariants: ["Frieren"],
    trailer: {},
    url: undefined,
    year: undefined,
    ...overrides,
  };
}

function makeSeasonalEntry(
  malId: number,
  overrides?: Partial<TenraiNormalizedSeasonalEntry>,
): TenraiNormalizedSeasonalEntry {
  return {
    coverImage: undefined,
    unitCount: 12,
    format: "TV",
    genres: undefined,
    malId,
    season: "spring",
    seasonYear: 2025,
    startYear: 2025,
    status: "Currently Airing",
    title: { romaji: `Romaji ${malId}` },
    ...overrides,
  };
}
