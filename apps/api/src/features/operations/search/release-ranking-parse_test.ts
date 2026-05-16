import { assert, it } from "@effect/vitest";

import {
  parseEpisodeFromTitle,
  parseEpisodeNumbersFromTitle,
  parseReleaseName,
} from "@/features/operations/search/release-ranking-parse.ts";

it("parseReleaseName extracts group, episodes, batch flag, and quality", () => {
  const parsed = parseReleaseName("[SubsPlease] Show - S01E03-E05 [1080p WEB-DL]");

  assert.deepStrictEqual(parsed.group, "SubsPlease");
  assert.deepStrictEqual(parsed.episodeNumber, 3);
  assert.deepStrictEqual(parsed.episodeNumbers, [3, 4, 5]);
  assert.deepStrictEqual(parsed.isBatch, true);
  assert.deepStrictEqual(parsed.quality.name, "WEB-DL 1080p");
});

it("parseReleaseName marks season packs and batch terms as batch releases", () => {
  assert.deepStrictEqual(parseReleaseName("[Group] Show S01 [1080p]").isBatch, true);
  assert.deepStrictEqual(parseReleaseName("[Group] Show Complete [1080p]").isBatch, true);
  assert.deepStrictEqual(parseReleaseName("[Group] Show - 03 [1080p]").isBatch, false);
});

it("parseReleaseName treats ordinal season dash episode releases as single episodes", () => {
  const parsed = parseReleaseName(
    "[Erai-raws] Re:Zero kara Hajimeru Isekai Seikatsu 4th Season - 01 [1080p CR WEB-DL AVC AAC][MultiSub]",
  );

  assert.deepStrictEqual(parsed.episodeNumbers, [1]);
  assert.deepStrictEqual(parsed.isBatch, false);
});

it("parseEpisodeFromTitle ignores daily source identities", () => {
  assert.deepStrictEqual(parseEpisodeFromTitle("[Group] Show - 2025.03.14 [1080p]"), undefined);
  assert.deepStrictEqual(parseEpisodeNumbersFromTitle("[Group] Show - 02-04 [1080p]"), [2, 3, 4]);
});
