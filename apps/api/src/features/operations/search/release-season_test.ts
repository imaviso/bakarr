import { assert, it } from "@effect/vitest";

import {
  decodeSynonyms,
  getReleaseSeason,
  inferExpectedAnimeSeason,
  inferSeasonFromTitle,
  isAnimeReleaseSeasonMismatch,
} from "@/features/operations/search/release-season.ts";

it("inferSeasonFromTitle parses ordinal and long season markers", () => {
  assert.deepStrictEqual(
    inferSeasonFromTitle("Re:Zero kara Hajimeru Isekai Seikatsu 4th Season"),
    4,
  );
  assert.deepStrictEqual(inferSeasonFromTitle("ReZero 2nd Season"), 2);
  assert.deepStrictEqual(inferSeasonFromTitle("My Hero Academia Season 2"), 2);
  assert.deepStrictEqual(inferSeasonFromTitle("Show Part 3"), 3);
  assert.deepStrictEqual(inferSeasonFromTitle("Overlord II"), 2);
  assert.deepStrictEqual(inferSeasonFromTitle("Frieren"), undefined);
});

it("getReleaseSeason extracts Sxx season", () => {
  assert.deepStrictEqual(
    getReleaseSeason(
      "[DKB] ReZero kara Hajimeru Isekai Seikatsu 2nd Season - S02E18 [1080p][HEVC-265 10bit][Multi-Subs][weekly",
    ),
    2,
  );
  assert.deepStrictEqual(
    getReleaseSeason("[Erai-raws] Re:Zero kara Hajimeru Isekai Seikatsu 4th Season - 18 [1080p]"),
    4,
  );
  assert.deepStrictEqual(getReleaseSeason("[SubsPlease] Frieren - 12 (1080p)"), undefined);
});

it("isAnimeReleaseSeasonMismatch rejects S02E18 for 4th Season media", () => {
  const media = {
    titleRomaji: "Re:Zero kara Hajimeru Isekai Seikatsu 4th Season",
    titleEnglish: null,
    format: "TV",
    synonyms: [] as string[],
  };

  assert.deepStrictEqual(
    isAnimeReleaseSeasonMismatch({
      media,
      releaseTitle:
        "[DKB] ReZero kara Hajimeru Isekai Seikatsu 2nd Season - S02E18 [1080p][HEVC-265 10bit][Multi-Subs][weekly",
    }),
    true,
  );

  assert.deepStrictEqual(
    isAnimeReleaseSeasonMismatch({
      media,
      releaseTitle:
        "[Erai-raws] Re:Zero kara Hajimeru Isekai Seikatsu 4th Season - 18 [1080p CR WEB-DL AVC AAC][MultiSub]",
    }),
    false,
  );
});

it("isAnimeReleaseSeasonMismatch defaults marker-less media to season 1", () => {
  const media = { titleRomaji: "Release that Witch", format: "TV", synonyms: [] as string[] };

  assert.deepStrictEqual(
    isAnimeReleaseSeasonMismatch({
      media,
      releaseTitle: "[ToonsHub] Release that Witch S01E08 1080p",
    }),
    false,
  );
  assert.deepStrictEqual(
    isAnimeReleaseSeasonMismatch({
      media,
      releaseTitle: "[Group] Release that Witch S02E08 [1080p]",
    }),
    true,
  );
  assert.deepStrictEqual(
    isAnimeReleaseSeasonMismatch({
      media,
      releaseTitle: "[SubsPlease] Release that Witch - 08 (1080p)",
    }),
    false,
  );
});

it("isAnimeReleaseSeasonMismatch rejects S00 for TV but allows OVA", () => {
  assert.deepStrictEqual(
    isAnimeReleaseSeasonMismatch({
      media: { titleRomaji: "Show", format: "TV", synonyms: [] as string[] },
      releaseTitle: "Show S00E03 [1080p]",
    }),
    true,
  );
  assert.deepStrictEqual(
    isAnimeReleaseSeasonMismatch({
      media: { titleRomaji: "Show OVA", format: "OVA", synonyms: [] as string[] },
      releaseTitle: "Show S00E03 [1080p]",
    }),
    false,
  );
});

it("inferExpectedAnimeSeason uses synonyms and decodeSynonyms parses JSON", () => {
  assert.deepStrictEqual(
    inferExpectedAnimeSeason({
      titleRomaji: "Show",
      synonyms: ["Show 3rd Season"],
    }),
    3,
  );
  assert.deepStrictEqual(decodeSynonyms('["A 2nd Season","B"]'), ["A 2nd Season", "B"]);
  assert.deepStrictEqual(decodeSynonyms(null), []);
});
