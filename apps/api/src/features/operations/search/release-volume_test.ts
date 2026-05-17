import { assert, describe, it } from "@effect/vitest";

import { parseVolumeNumbersFromTitle } from "@/features/operations/search/release-volume.ts";

describe("parseVolumeNumbersFromTitle", () => {
  it("parses common manga and light novel volume labels", () => {
    assert.deepStrictEqual(parseVolumeNumbersFromTitle("Some Manga Vol 3 [Digital]"), [3]);
    assert.deepStrictEqual(parseVolumeNumbersFromTitle("Some Manga Volume 12.cbz"), [12]);
    assert.deepStrictEqual(parseVolumeNumbersFromTitle("Some Novel v07 epub"), [7]);
  });

  it("deduplicates repeated volume labels in source order", () => {
    assert.deepStrictEqual(parseVolumeNumbersFromTitle("Title Vol. 2 + v02 + Volume 3"), [2, 3]);
  });

  it("does not treat release revision tags as additional volumes", () => {
    assert.deepStrictEqual(parseVolumeNumbersFromTitle("Title Vol 01 v2"), [1]);
    assert.deepStrictEqual(parseVolumeNumbersFromTitle("Title Volume 12 [v2]"), [12]);
  });

  it("does not treat media episode labels as volumes", () => {
    assert.deepStrictEqual(parseVolumeNumbersFromTitle("Title - 07 [1080p]"), []);
    assert.deepStrictEqual(parseVolumeNumbersFromTitle("Title S01E07"), []);
  });
});
