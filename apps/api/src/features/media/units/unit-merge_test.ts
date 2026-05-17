import { assert, it } from "@effect/vitest";

import { mergeAnimeMetadataEpisodes } from "@/features/media/units/unit-merge.ts";

it("mergeAnimeMetadataEpisodes returns undefined when both sources are empty", () => {
  assert.deepStrictEqual(mergeAnimeMetadataEpisodes(undefined, undefined), undefined);
  assert.deepStrictEqual(mergeAnimeMetadataEpisodes([], []), undefined);
});

it("mergeAnimeMetadataEpisodes keeps primary fields and fills missing fields from fallback", () => {
  const merged = mergeAnimeMetadataEpisodes(
    [{ aired: "2025-01-01", number: 1, title: "Primary Title" }, { number: 2 }],
    [
      { aired: "2025-01-02", durationSeconds: 1440, number: 1, title: "Fallback Title" },
      { aired: "2025-01-09", durationSeconds: 1500, number: 2, title: "Fallback Two" },
    ],
  );

  assert.deepStrictEqual(merged, [
    { aired: "2025-01-01", durationSeconds: 1440, number: 1, title: "Primary Title" },
    { aired: "2025-01-09", durationSeconds: 1500, number: 2, title: "Fallback Two" },
  ]);
});

it("mergeAnimeMetadataEpisodes includes fallback-only mediaUnits and sorts by episode number", () => {
  const merged = mergeAnimeMetadataEpisodes(
    [{ number: 3, title: "Three" }],
    [
      { number: 1, title: "One" },
      { number: 2, title: "Two" },
    ],
  );

  assert.deepStrictEqual(merged, [
    { number: 1, title: "One" },
    { number: 2, title: "Two" },
    { number: 3, title: "Three" },
  ]);
});
