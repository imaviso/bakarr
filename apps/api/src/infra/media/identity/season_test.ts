import { assert, it } from "@effect/vitest";

import { parseSeasonEpisodeIdentity } from "@/infra/media/identity/season.ts";

it("parseSeasonEpisodeIdentity parses season episode ranges", () => {
  const parsed = parseSeasonEpisodeIdentity("Show - S02E03-E05 [1080p]");

  assert.deepStrictEqual(parsed?.scheme, "season");
  assert.deepStrictEqual(parsed?.season, 2);
  assert.deepStrictEqual(parsed?.unit_numbers, [3, 4, 5]);
  assert.deepStrictEqual(parsed?.label, "S02E03-E05");
});

it("parseSeasonEpisodeIdentity parses repeated episode markers", () => {
  const parsed = parseSeasonEpisodeIdentity("Show.S01E01E03E05.1080p");

  assert.deepStrictEqual(parsed?.season, 1);
  assert.deepStrictEqual(parsed?.unit_numbers, [1, 3, 5]);
  assert.deepStrictEqual(parsed?.label, "S01E01-S01E03-S01E05");
});

it("parseSeasonEpisodeIdentity parses 1x02 and long season formats", () => {
  assert.deepStrictEqual(parseSeasonEpisodeIdentity("Show - 2x07 - Title")?.label, "S02E07");
  assert.deepStrictEqual(
    parseSeasonEpisodeIdentity("Show - Season 3 Episode 4 - Title")?.label,
    "S03E04",
  );
});

it("parseSeasonEpisodeIdentity rejects impossible episode ranges", () => {
  assert.deepStrictEqual(parseSeasonEpisodeIdentity("Show - S01E2000"), undefined);
  assert.deepStrictEqual(parseSeasonEpisodeIdentity("Show - Season 1 Episode 2000"), undefined);
  assert.deepStrictEqual(parseSeasonEpisodeIdentity("Show - S01E05-E03"), undefined);
  assert.deepStrictEqual(parseSeasonEpisodeIdentity("Show - S01E01-E2500"), undefined);
});
