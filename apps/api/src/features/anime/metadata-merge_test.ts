import { assert, it } from "@effect/vitest";

import type { AnimeMetadata } from "@/features/anime/anilist-model.ts";
import {
  convertJikanRelationsToDiscoveryEntries,
  mergeAnimeMetadata,
  mergeGenres,
  mergeScore,
  mergeStudios,
  scaleJikanScoreToAniList,
} from "@/features/anime/metadata-merge.ts";

it("merges title/description/date/status/format/score/genres/studios/synonyms fields deterministically", () => {
  const anilist = makeAniListMetadata({
    description: undefined,
    endDate: undefined,
    episodeCount: undefined,
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
    jikan: {
      endDate: "2013-09-29",
      episodeCount: 25,
      format: "TV",
      genres: ["Drama", "Shounen", "Military"],
      malId: 16498,
      relations: [],
      score: 9.14,
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
    },
    manami: {
      sources: ["https://anilist.co/anime/16498"],
      studios: ["MAPPA"],
      synonyms: ["  Attack on Titan  ", "進撃の巨人"],
      tags: ["Military", "Dark Fantasy"],
      title: "進撃の巨人",
    },
  });

  assert.deepStrictEqual(merged.id, anilist.id);
  assert.deepStrictEqual(merged.title.romaji, "Shingeki no Kyojin");
  assert.deepStrictEqual(merged.title.english, "Attack on Titan");
  assert.deepStrictEqual(merged.title.native, "進撃の巨人");
  assert.deepStrictEqual(merged.description, "Humanity fights titans.");
  assert.deepStrictEqual(merged.episodeCount, 25);
  assert.deepStrictEqual(merged.status, "Finished Airing");
  assert.deepStrictEqual(merged.startDate, "2013-04-07");
  assert.deepStrictEqual(merged.endDate, "2013-09-29");
  assert.deepStrictEqual(merged.format, "TV");
  assert.deepStrictEqual(merged.score, 91);
  assert.deepStrictEqual(merged.genres, ["Action", "Drama", "Shounen", "Military", "Dark Fantasy"]);
  assert.deepStrictEqual(merged.studios, ["Wit Studio"]);
  assert.deepStrictEqual(merged.synonyms, ["SNK", "Attack on Titan", "AoT", "進撃の巨人"]);
});

it("fills date only when primary is nullish", () => {
  const mergedWithPrimaryEmptyDate = mergeAnimeMetadata({
    anilist: makeAniListMetadata({
      endDate: "",
      startDate: "",
    }),
    jikan: {
      endDate: "2022-12-31",
      episodeCount: undefined,
      format: undefined,
      genres: [],
      malId: 1,
      relations: [],
      score: undefined,
      startDate: "2022-01-01",
      status: undefined,
      studios: [],
      synopsis: undefined,
      title: {},
      titleVariants: [],
    },
  });

  assert.deepStrictEqual(mergedWithPrimaryEmptyDate.startDate, "");
  assert.deepStrictEqual(mergedWithPrimaryEmptyDate.endDate, "");

  const mergedWithPrimaryMissingDate = mergeAnimeMetadata({
    anilist: makeAniListMetadata({
      endDate: undefined,
      startDate: undefined,
    }),
    jikan: {
      endDate: "2022-12-31",
      episodeCount: undefined,
      format: undefined,
      genres: [],
      malId: 1,
      relations: [],
      score: undefined,
      startDate: "2022-01-01",
      status: undefined,
      studios: [],
      synopsis: undefined,
      title: {},
      titleVariants: [],
    },
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
    jikan: {
      endDate: undefined,
      episodeCount: undefined,
      format: "  TV  ",
      genres: [],
      malId: 1,
      relations: [],
      score: undefined,
      startDate: undefined,
      status: "  Finished Airing  ",
      studios: [],
      synopsis: undefined,
      title: {},
      titleVariants: [],
    },
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
    jikan: {
      endDate: undefined,
      episodeCount: undefined,
      format: " ",
      genres: [],
      malId: 1,
      relations: [],
      score: undefined,
      startDate: undefined,
      status: "   ",
      studios: [],
      synopsis: undefined,
      title: {},
      titleVariants: [],
    },
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

it("uses studio precedence AniList then Jikan then Manami", () => {
  assert.deepStrictEqual(mergeStudios(["Bones"], ["MAPPA"], ["Studio Pierrot"]), ["Bones"]);
  assert.deepStrictEqual(mergeStudios([], ["MAPPA"], ["Studio Pierrot"]), ["MAPPA"]);
  assert.deepStrictEqual(mergeStudios([], [], ["Studio Pierrot"]), ["Studio Pierrot"]);
  assert.deepStrictEqual(mergeStudios(undefined, undefined, undefined), undefined);
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
    { id: 2, relation_type: "Sequel", title: { romaji: "Mapped A" } },
    { id: 3, relation_type: "Prequel", title: { romaji: "Mapped B" } },
  ]);
});

it("appends mapped relations to related/recommended without duplicates", () => {
  const merged = mergeAnimeMetadata({
    anilist: makeAniListMetadata({
      recommendedAnime: [{ id: 5, title: { romaji: "Existing Rec" } }],
      relatedAnime: [
        { id: 4, title: { romaji: "Existing Rel" } },
        { id: 6, title: { romaji: "Self" } },
      ],
    }),
    jikan: {
      endDate: undefined,
      episodeCount: undefined,
      format: undefined,
      genres: [],
      malId: 1,
      relations: [
        { malId: 10, relation: "Sequel", title: "Existing Rel" },
        { malId: 11, relation: "Spin-off", title: "Fresh" },
        { malId: 12, relation: "Adaptation", title: "Self" },
      ],
      score: undefined,
      startDate: undefined,
      status: undefined,
      studios: [],
      synopsis: undefined,
      title: {},
      titleVariants: [],
    },
    malToAniListId: new Map([
      [10, 4],
      [11, 5],
      [12, 6],
    ]),
  });

  assert.deepStrictEqual(merged.relatedAnime, [
    { id: 4, title: { romaji: "Existing Rel" } },
    { id: 6, title: { romaji: "Self" } },
    { id: 5, relation_type: "Spin-off", title: { romaji: "Fresh" } },
  ]);
  assert.deepStrictEqual(merged.recommendedAnime, [
    { id: 5, title: { romaji: "Existing Rec" } },
    { id: 4, relation_type: "Sequel", title: { romaji: "Existing Rel" } },
    { id: 6, relation_type: "Adaptation", title: { romaji: "Self" } },
  ]);
});

it("keeps genre union stable and deduped", () => {
  assert.deepStrictEqual(
    mergeGenres(["Action", "Drama"], ["Drama", "Military"], ["Military", "Mystery"]),
    ["Action", "Drama", "Military", "Mystery"],
  );
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
