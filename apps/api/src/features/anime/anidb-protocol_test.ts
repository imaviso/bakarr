import { assert, it } from "@effect/vitest";

import {
  buildTitleCandidates,
  parseAid,
  parseAniDbResponse,
  parseEpisodeResponse,
} from "@/features/anime/anidb-protocol.ts";

it("parseAniDbResponse decodes tagged headers and body lines", () => {
  const parsed = parseAniDbResponse("mytag 230 OK\n101|Title\n");

  assert.deepStrictEqual(parsed, {
    code: 230,
    lines: ["101|Title"],
    rest: "OK",
  });
});

it("parseAid reads numeric ids from ANIME rows", () => {
  assert.deepStrictEqual(parseAid("12345|Foo"), 12345);
  assert.deepStrictEqual(parseAid(undefined), undefined);
  assert.deepStrictEqual(parseAid("foo|bar"), undefined);
});

it("parseEpisodeResponse maps main episodes with normalized text and aired date", () => {
  const row = [
    "eid",
    "aid",
    "unused",
    "unused",
    "unused",
    "1",
    "Episode One",
    "",
    "",
    "1704153600",
    "1",
  ].join("|");

  assert.deepStrictEqual(parseEpisodeResponse(row, 7), {
    aired: "2024-01-02T00:00:00.000Z",
    number: 1,
    title: "Episode One",
  });
});

it("parseEpisodeResponse ignores non-main episode types", () => {
  const row = ["eid", "aid", "", "", "", "1", "Special", "", "", "1704153600", "2"].join(
    "|",
  );

  assert.deepStrictEqual(parseEpisodeResponse(row, 1), undefined);
});

it("buildTitleCandidates deduplicates and caps candidate count", () => {
  const result = buildTitleCandidates(
    {
      english: "A",
      native: "B",
      romaji: "A",
    },
    ["  ", "C", "D", "E", "F", "G", "H", "I", "J"],
  );

  assert.deepStrictEqual(result, ["A", "B", "C", "D", "E", "F", "G", "H"]);
});
