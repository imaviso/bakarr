import { assert, it } from "@effect/vitest";
import { brandMediaId } from "@packages/shared/index.ts";

import type { AnimeMetadata } from "@/features/media/metadata/anilist-model.ts";
import type { JikanNormalizedAnime } from "@/features/media/metadata/jikan-model.ts";
import {
  convertJikanRecommendationsToDiscoveryEntries,
  convertJikanRelationsToDiscoveryEntries,
  mergeAnimeMetadata,
  mergeGenres,
  mergeScore,
  mergeStudios,
  scaleJikanScoreToAniList,
} from "@/features/media/metadata/metadata-merge.ts";

it("merges title/description/date/status/format/score/genres/studios/synonyms fields deterministically", () => {
  const anilist = makeAniListMetadata({
    description: undefined,
    endDate: undefined,
    unitCount: undefined,
    format: "",
    genres: ["Action", "Drama"],
    score: undefined,
    startDate: undefined,
    status: " ",
    studios: [],
    synonyms: ["  SNK", "Attack on Titan"],
    title: {
      romaji: "Shingeki no Kyojin",
    },
  });

  const merged = mergeAnimeMetadata({
    anilist,
    jikan: makeJikanMetadata({
      background: "Post-war background",
      duration: "24 min per ep",
      endDate: "2013-09-29",
      unitCount: 25,
      favorites: 77777,
      format: "TV",
      genres: ["Drama", "Shounen", "Military"],
      malId: 16498,
      members: 123456,
      popularity: 10,
      rank: 3,
      rating: "PG-13 - Teens 13 or older",
      relations: [],
      score: 9.14,
      source: "Manga",
      startDate: "2013-04-07",
      status: "Finished Airing",
      studios: ["Wit Studio"],
      synopsis: "Humanity fights titans.",
      title: {
        english: undefined,
        native: undefined,
        romaji: "Shingeki no Kyojin",
      },
      titleVariants: ["Attack on Titan", "  AoT", "Attack on Titan"],
    }),
    manami: {
      englishTitle: "Attack on Titan",
      nativeTitle: "進撃の巨人",
      title: "進撃の巨人",
    },
  });

  assert.deepStrictEqual(merged.id, anilist.id);
  assert.deepStrictEqual(merged.title.romaji, "Shingeki no Kyojin");
  assert.deepStrictEqual(merged.title.english, "Attack on Titan");
  assert.deepStrictEqual(merged.title.native, "進撃の巨人");
  assert.deepStrictEqual(merged.description, "Humanity fights titans.");
  assert.deepStrictEqual(merged.background, "Post-war background");
  assert.deepStrictEqual(merged.duration, "24 min per ep");
  assert.deepStrictEqual(merged.unitCount, 25);
  assert.deepStrictEqual(merged.favorites, 77777);
  assert.deepStrictEqual(merged.members, 123456);
  assert.deepStrictEqual(merged.popularity, 10);
  assert.deepStrictEqual(merged.rank, 3);
  assert.deepStrictEqual(merged.rating, "PG-13 - Teens 13 or older");
  assert.deepStrictEqual(merged.source, "Manga");
  assert.deepStrictEqual(merged.status, "Finished Airing");
  assert.deepStrictEqual(merged.startDate, "2013-04-07");
  assert.deepStrictEqual(merged.endDate, "2013-09-29");
  assert.deepStrictEqual(merged.format, "TV");
  assert.deepStrictEqual(merged.score, 91);
  assert.deepStrictEqual(merged.genres, ["Action", "Drama", "Shounen", "Military"]);
  assert.deepStrictEqual(merged.studios, ["Wit Studio"]);
  assert.deepStrictEqual(merged.synonyms, ["SNK", "Attack on Titan", "AoT"]);
});

it("fills date only when primary is nullish", () => {
  const mergedWithPrimaryEmptyDate = mergeAnimeMetadata({
    anilist: makeAniListMetadata({
      endDate: "",
      startDate: "",
    }),
    jikan: makeJikanMetadata({
      endDate: "2022-12-31",
      malId: 1,
      startDate: "2022-01-01",
    }),
  });

  assert.deepStrictEqual(mergedWithPrimaryEmptyDate.startDate, "");
  assert.deepStrictEqual(mergedWithPrimaryEmptyDate.endDate, "");

  const mergedWithPrimaryMissingDate = mergeAnimeMetadata({
    anilist: makeAniListMetadata({
      endDate: undefined,
      startDate: undefined,
    }),
    jikan: makeJikanMetadata({
      endDate: "2022-12-31",
      malId: 1,
      startDate: "2022-01-01",
    }),
  });

  assert.deepStrictEqual(mergedWithPrimaryMissingDate.startDate, "2022-01-01");
  assert.deepStrictEqual(mergedWithPrimaryMissingDate.endDate, "2022-12-31");
});

it("fills status/format from fallback when primary is blank", () => {
  const merged = mergeAnimeMetadata({
    anilist: makeAniListMetadata({
      format: "   ",
      status: "",
    }),
    jikan: makeJikanMetadata({
      format: "  TV  ",
      malId: 1,
      status: "  Finished Airing  ",
    }),
  });

  assert.deepStrictEqual(merged.format, "TV");
  assert.deepStrictEqual(merged.status, "Finished Airing");
});

it("keeps blank status/format primary when both primary and fallback blank", () => {
  const merged = mergeAnimeMetadata({
    anilist: makeAniListMetadata({
      format: "   ",
      status: "",
    }),
    jikan: makeJikanMetadata({
      format: " ",
      malId: 1,
      status: "   ",
    }),
  });

  assert.deepStrictEqual(merged.format, "   ");
  assert.deepStrictEqual(merged.status, "");
});

it("keeps AniList score and scales Jikan score with clamp", () => {
  assert.deepStrictEqual(mergeScore(73, 9.9), 73);
  assert.deepStrictEqual(scaleJikanScoreToAniList(9.14), 91);
  assert.deepStrictEqual(scaleJikanScoreToAniList(0), 1);
  assert.deepStrictEqual(scaleJikanScoreToAniList(11.2), 100);
});

it("keeps AniList ranking/source fields when present", () => {
  const merged = mergeAnimeMetadata({
    anilist: makeAniListMetadata({
      favorites: 5,
      members: 10,
      popularity: 20,
      rank: 30,
      rating: "R - 17+ (violence & profanity)",
      source: "ORIGINAL",
    }),
    jikan: makeJikanMetadata({
      favorites: 999,
      malId: 1,
      members: 999,
      popularity: 999,
      rank: 999,
      rating: "PG-13 - Teens 13 or older",
      source: "Manga",
    }),
  });

  assert.deepStrictEqual(merged.favorites, 5);
  assert.deepStrictEqual(merged.members, 10);
  assert.deepStrictEqual(merged.popularity, 20);
  assert.deepStrictEqual(merged.rank, 30);
  assert.deepStrictEqual(merged.rating, "R - 17+ (violence & profanity)");
  assert.deepStrictEqual(merged.source, "ORIGINAL");
});

it("uses studio precedence AniList then Jikan", () => {
  assert.deepStrictEqual(mergeStudios(["Bones"], ["MAPPA"]), ["Bones"]);
  assert.deepStrictEqual(mergeStudios([], ["MAPPA"]), ["MAPPA"]);
  assert.deepStrictEqual(mergeStudios([], []), undefined);
  assert.deepStrictEqual(mergeStudios(undefined, undefined), undefined);
});

it("converts only mapped Jikan relations to discovery entries", () => {
  const entries = convertJikanRelationsToDiscoveryEntries(
    [
      { malId: 200, relation: "Sequel", title: "Mapped A" },
      { malId: 201, relation: "Prequel", title: "Mapped B" },
      { malId: 202, relation: "Other", title: "Not mapped" },
      { malId: 203, relation: "Side Story", title: "Mapped duplicate" },
    ],
    new Map([
      [200, 2],
      [201, 3],
      [203, 3],
    ]),
  );

  assert.deepStrictEqual(entries, [
    { id: brandMediaId(2), relation_type: "Sequel", title: { romaji: "Mapped A" } },
    { id: brandMediaId(3), relation_type: "Prequel", title: { romaji: "Mapped B" } },
  ]);
});

it("converts only mapped Jikan recommendations to discovery entries", () => {
  const entries = convertJikanRecommendationsToDiscoveryEntries(
    [
      { malId: 301, title: "Rec A" },
      { malId: 302, title: "Rec B" },
      { malId: 303, title: "Not mapped" },
      { malId: 304, title: "Mapped duplicate" },
    ],
    new Map([
      [301, 11],
      [302, 12],
      [304, 12],
    ]),
  );

  assert.deepStrictEqual(entries, [
    { id: brandMediaId(11), title: { romaji: "Rec A" } },
    { id: brandMediaId(12), title: { romaji: "Rec B" } },
  ]);
});

it("appends mapped relations to related/recommended without duplicates", () => {
  const merged = mergeAnimeMetadata({
    anilist: makeAniListMetadata({
      recommendedMedia: [{ id: brandMediaId(5), title: { romaji: "Existing Rec" } }],
      relatedMedia: [
        { id: brandMediaId(4), title: { romaji: "Existing Rel" } },
        { id: brandMediaId(6), title: { romaji: "Self" } },
      ],
    }),
    jikan: makeJikanMetadata({
      malId: 1,
      relations: [
        { malId: 10, relation: "Sequel", title: "Existing Rel" },
        { malId: 11, relation: "Spin-off", title: "Fresh" },
        { malId: 12, relation: "Adaptation", title: "Self" },
      ],
      recommendations: [
        { malId: 13, title: "Fresh Rec" },
        { malId: 12, title: "Self" },
      ],
    }),
    malToAniListId: new Map([
      [10, 4],
      [11, 5],
      [12, 6],
      [13, 7],
    ]),
  });

  assert.deepStrictEqual(merged.relatedMedia, [
    { id: brandMediaId(4), title: { romaji: "Existing Rel" } },
    { id: brandMediaId(6), title: { romaji: "Self" } },
    { id: brandMediaId(5), relation_type: "Spin-off", title: { romaji: "Fresh" } },
  ]);
  assert.deepStrictEqual(merged.recommendedMedia, [
    { id: brandMediaId(5), title: { romaji: "Existing Rec" } },
    { id: brandMediaId(7), title: { romaji: "Fresh Rec" } },
    { id: brandMediaId(6), title: { romaji: "Self" } },
    { id: brandMediaId(4), relation_type: "Sequel", title: { romaji: "Existing Rel" } },
  ]);
});

it("keeps genre union stable and deduped", () => {
  assert.deepStrictEqual(mergeGenres(["Action", "Drama"], ["Drama", "Military"]), [
    "Action",
    "Drama",
    "Military",
  ]);
});

function makeAniListMetadata(overrides: Partial<AnimeMetadata>): AnimeMetadata {
  const overrideTitle = overrides.title;

  return {
    format: "TV",
    id: 6,
    status: "RELEASING",
    ...overrides,
    title: {
      romaji: overrideTitle?.romaji ?? "Base",
      ...(overrideTitle?.english !== undefined
        ? { english: overrideTitle.english }
        : overrideTitle === undefined
          ? { english: "Base English" }
          : {}),
      ...(overrideTitle?.native !== undefined
        ? { native: overrideTitle.native }
        : overrideTitle === undefined
          ? { native: "ベース" }
          : {}),
    },
  };
}

function makeJikanMetadata(overrides: Partial<JikanNormalizedAnime> = {}): JikanNormalizedAnime {
  const malId = overrides.malId ?? 1;

  return {
    airing: false,
    approved: true,
    background: undefined,
    broadcast: {},
    demographics: [],
    duration: undefined,
    endDate: undefined,
    endYear: undefined,
    unitCount: undefined,
    explicitGenres: [],
    favorites: undefined,
    format: undefined,
    genres: [],
    images: {},
    licensors: [],
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
    studios: [],
    synopsis: undefined,
    themes: [],
    title: {},
    titleVariants: [],
    trailer: {},
    year: undefined,
    ...overrides,
    malId: overrides.malId ?? malId,
    url: overrides.url ?? `https://myanimelist.net/media/${overrides.malId ?? malId}`,
  };
}
