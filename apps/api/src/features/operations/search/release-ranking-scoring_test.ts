import { assert, it } from "@effect/vitest";

import { calculateReleaseScore } from "@/features/operations/search/release-ranking-scoring.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";

const config = makeTestConfig("./test.sqlite", (base) => ({
  ...base,
  nyaa: {
    ...base.nyaa,
    filter_remakes: true,
    preferred_resolution: "1080p",
  },
}));

it("calculateReleaseScore applies preferred rules, trust, resolution, and remake penalty", () => {
  const score = calculateReleaseScore(
    {
      group: "GoodGroup",
      isSeaDex: false,
      isSeaDexBest: false,
      remake: true,
      seeders: 20,
      sizeBytes: 1024,
      title: "[GoodGroup] Show - 01 [1080p WEB-DL HEVC]",
      trusted: true,
    },
    [{ rule_type: "preferred", score: 15, term: "HEVC" }],
    config,
  );

  assert.deepStrictEqual(score, 5);
});

it("calculateReleaseScore applies SeaDex tag and note adjustments", () => {
  const score = calculateReleaseScore(
    {
      group: "GoodGroup",
      isSeaDex: true,
      isSeaDexBest: false,
      remake: false,
      seaDexNotes: "Recommended for GoodGroup, avoid broken v1",
      seaDexTags: ["Best", "Alt"],
      seeders: 20,
      sizeBytes: 1024,
      title: "[GoodGroup] Show - 01 [720p WEB-DL]",
      trusted: false,
    },
    [],
    config,
  );

  assert.deepStrictEqual(score, 16);
});
