import { assert, it } from "@effect/vitest";

import { parseRssReleaseUnitNumbers } from "@/features/operations/background-search/background-search-rss-release.ts";

it("parseRssReleaseUnitNumbers parses media episode numbers", () => {
  assert.deepStrictEqual(
    parseRssReleaseUnitNumbers({
      mediaKind: "anime",
      title: "[SubsPlease] Frieren - 12 (1080p) [ABCDEF12].mkv",
    }),
    [12],
  );
});

it("parseRssReleaseUnitNumbers parses manga volume numbers", () => {
  assert.deepStrictEqual(
    parseRssReleaseUnitNumbers({
      mediaKind: "manga",
      title: "Witch Hat Atelier Vol. 07 [Digital] [LuCaZ].cbz",
    }),
    [7],
  );
});

it("parseRssReleaseUnitNumbers parses light novel volume numbers", () => {
  assert.deepStrictEqual(
    parseRssReleaseUnitNumbers({
      mediaKind: "light_novel",
      title: "Ascendance of a Bookworm v12 EPUB",
    }),
    [12],
  );
});
