import { assert, it } from "@effect/vitest";

import {
  deriveEpisodeTimelineMetadata,
  inferAiredAt,
  scoreAnimeSearchResultMatch,
  summarizeEpisodeCoverage,
} from "@/domain/media/derivations.ts";

it("deriveEpisodeTimelineMetadata classifies aired, future, and unknown mediaUnits", () => {
  const now = new Date("2025-05-01T00:00:00.000Z");

  assert.deepStrictEqual(deriveEpisodeTimelineMetadata("2025-04-30T23:59:59.000Z", now), {
    airing_status: "aired",
    is_future: false,
  });
  assert.deepStrictEqual(deriveEpisodeTimelineMetadata("2025-05-02T00:00:00.000Z", now), {
    airing_status: "future",
    is_future: true,
  });
  assert.deepStrictEqual(deriveEpisodeTimelineMetadata("not-a-date", now), {
    airing_status: "unknown",
    is_future: undefined,
  });
  assert.deepStrictEqual(deriveEpisodeTimelineMetadata("2025-05-01T00:00:00.000Z"), {
    airing_status: "unknown",
    is_future: undefined,
  });
});

it("summarizeEpisodeCoverage prefers air date and formats sorted unique mediaUnits", () => {
  assert.deepStrictEqual(
    summarizeEpisodeCoverage({ airDate: "2025-05-01", unitNumbers: [3, 2, 2] }),
    "Air date 2025-05-01",
  );
  assert.deepStrictEqual(summarizeEpisodeCoverage({ unitNumbers: [3, 1, 2, 2] }), "Episodes 1-3");
  assert.deepStrictEqual(summarizeEpisodeCoverage({ unitNumbers: [5, 1, 3] }), "Episodes 1, 3, 5");
  assert.deepStrictEqual(summarizeEpisodeCoverage({ unitNumbers: [1, 0, Number.NaN] }), undefined);
});

it("inferAiredAt uses explicit and nearest schedule before date interpolation", () => {
  const schedule = new Map<number, string>([
    [4, "2025-04-22T00:00:00.000Z"],
    [7, "2025-05-20T00:00:00.000Z"],
  ]);

  assert.deepStrictEqual(
    inferAiredAt("RELEASING", 4, undefined, "2025-04-01", undefined, schedule),
    "2025-04-22T00:00:00.000Z",
  );
  assert.deepStrictEqual(
    inferAiredAt("RELEASING", 5, undefined, "2025-04-01", undefined, schedule),
    "2025-04-29T00:00:00.000Z",
  );
  assert.deepStrictEqual(
    inferAiredAt("RELEASING", 3, undefined, "2025-04-01", undefined),
    "2025-04-15T00:00:00.000Z",
  );
});

it("inferAiredAt interpolates finished series across start and end dates", () => {
  assert.deepStrictEqual(
    inferAiredAt("FINISHED", 2, 3, "2025-01-01", "2025-01-15"),
    "2025-01-08T00:00:00.000Z",
  );
  assert.deepStrictEqual(
    inferAiredAt("FINISHED", 2, 3, undefined, undefined, undefined, "2025-02-01T00:00:00.000Z"),
    "2025-02-01T00:00:00.000Z",
  );
});

it("scoreAnimeSearchResultMatch normalizes stop words, years, and roman numerals", () => {
  const candidate = {
    synonyms: ["Dungeon Meshi"],
    title: {
      english: "Delicious in Dungeon",
      native: "",
      romaji: "Dungeon Meshi (2024)",
    },
  };

  assert.deepStrictEqual(scoreAnimeSearchResultMatch("Dungeon Meshi", candidate), 1);
  assert.deepStrictEqual(scoreAnimeSearchResultMatch("The Delicious Dungeon", candidate), 2 / 3);
  assert.deepStrictEqual(
    scoreAnimeSearchResultMatch("Show II", {
      synonyms: [],
      title: { english: undefined, native: undefined, romaji: "Show 2" },
    }),
    1,
  );
  assert.deepStrictEqual(
    scoreAnimeSearchResultMatch("Show III", {
      synonyms: [],
      title: { english: undefined, native: undefined, romaji: "Show 3" },
    }),
    1,
  );
});
