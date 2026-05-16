import { assert, it } from "@effect/vitest";

import {
  buildTitleCandidates,
  parseAid,
  parseAnimeLookupMatch,
  parseAniDbResponse,
  parseEpisodeResponse,
  scoreAnimeLookupCandidate,
} from "@/features/anime/metadata/anidb-protocol.ts";

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

it("parseAnimeLookupMatch decodes aid and title", () => {
  assert.deepStrictEqual(parseAnimeLookupMatch("12345|Sousou no Frieren|foo"), {
    aid: 12345,
    title: "Sousou no Frieren",
  });
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
  const row = ["eid", "aid", "", "", "", "1", "Special", "", "", "1704153600", "2"].join("|");

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

  assert.deepStrictEqual(result, [
    { source: "romaji", value: "A" },
    { source: "native", value: "B" },
    { source: "synonym", value: "C" },
    { source: "synonym", value: "D" },
    { source: "synonym", value: "E" },
    { source: "synonym", value: "F" },
    { source: "synonym", value: "G" },
    { source: "synonym", value: "H" },
  ]);
});

it("scoreAnimeLookupCandidate prefers exact title matches", () => {
  const exact = scoreAnimeLookupCandidate(
    { source: "romaji", value: "Sousou no Frieren" },
    "Sousou no Frieren",
  );
  const partial = scoreAnimeLookupCandidate(
    { source: "romaji", value: "Frieren" },
    "Sousou no Frieren",
  );

  assert.deepStrictEqual(exact > partial, true);
});
