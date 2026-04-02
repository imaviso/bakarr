import { assert, it } from "@effect/vitest";

import {
  fallbackReleases,
  mapSearchCategory,
  mapSearchFilter,
  toNyaaSearchResult,
} from "@/features/operations/search-support.ts";
import type { ParsedRelease } from "@/features/operations/rss-client-parse.ts";

it("mapSearchCategory and mapSearchFilter use expected mappings and fallbacks", () => {
  assert.deepStrictEqual(mapSearchCategory("anime_english", "1_0"), "1_2");
  assert.deepStrictEqual(mapSearchCategory("unknown", "1_0"), "1_0");

  assert.deepStrictEqual(mapSearchFilter("trusted_only", "0"), "2");
  assert.deepStrictEqual(mapSearchFilter("unknown", "0"), "0");
});

it("toNyaaSearchResult preserves release fields and parses episode number", () => {
  const release: ParsedRelease = {
    group: "SubsPlease",
    infoHash: "abcdef1234567890abcdef1234567890abcdef12",
    isSeaDex: true,
    isSeaDexBest: false,
    leechers: 2,
    magnet: "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12",
    pubDate: "2024-01-01T00:00:00.000Z",
    remake: false,
    resolution: "1080p",
    seaDexComparison: "https://releases.moe/compare/example",
    seaDexDualAudio: true,
    seaDexNotes: "Preferred release",
    seaDexReleaseGroup: "SeaDexGroup",
    seaDexTags: ["Best", "Dual Audio"],
    seeders: 50,
    size: "1.4 GiB",
    sizeBytes: 1503238554,
    title: "[SubsPlease] Naruto - 01 (1080p)",
    trusted: true,
    viewUrl: "https://nyaa.si/view/1",
  };

  const result = toNyaaSearchResult(release);

  assert.deepStrictEqual(result.info_hash, release.infoHash);
  assert.deepStrictEqual(result.indexer, "Nyaa");
  assert.deepStrictEqual(result.parsed_group, "SubsPlease");
  assert.deepStrictEqual(result.parsed_quality, "WEB-DL 1080p");
  assert.deepStrictEqual(result.parsed_episode, "1");
  assert.deepStrictEqual(result.parsed_episode_label, "01");
  assert.deepStrictEqual(result.parsed_episode_numbers, [1]);
  assert.deepStrictEqual(result.parsed_resolution, "1080p");
  assert.deepStrictEqual(result.trusted, true);
  assert.deepStrictEqual(result.remake, false);
  assert.deepStrictEqual(result.view_url, "https://nyaa.si/view/1");
  assert.deepStrictEqual(result.is_seadex, true);
  assert.deepStrictEqual(result.is_seadex_best, false);
  assert.deepStrictEqual(result.seadex_release_group, "SeaDexGroup");
  assert.deepStrictEqual(result.seadex_tags, ["Best", "Dual Audio"]);
  assert.deepStrictEqual(result.seadex_notes, "Preferred release");
  assert.deepStrictEqual(result.seadex_comparison, "https://releases.moe/compare/example");
  assert.deepStrictEqual(result.seadex_dual_audio, true);
});

it("toNyaaSearchResult maps daily releases to parsed air date", () => {
  const release: ParsedRelease = {
    group: "Erai-raws",
    infoHash: "fedcba1234567890fedcba1234567890fedcba12",
    isSeaDex: false,
    isSeaDexBest: false,
    leechers: 2,
    magnet: "magnet:?xt=urn:btih:fedcba1234567890fedcba1234567890fedcba12",
    pubDate: "2024-01-01T00:00:00.000Z",
    remake: false,
    resolution: "1080p",
    seeders: 50,
    size: "1.4 GiB",
    sizeBytes: 1503238554,
    title: "[Erai-raws] Show - 2025-03-14 [1080p]",
    trusted: true,
    viewUrl: "https://nyaa.si/view/2",
  };

  const result = toNyaaSearchResult(release);

  assert.deepStrictEqual(result.parsed_air_date, "2025-03-14");
  assert.deepStrictEqual(result.parsed_episode_numbers, undefined);
});

it("fallbackReleases builds a trusted placeholder release from title", () => {
  const [release] = fallbackReleases("naruto", "Naruto Shippuden");

  assert.deepStrictEqual(release.group, "SubsPlease");
  assert.deepStrictEqual(release.isSeaDex, false);
  assert.deepStrictEqual(release.isSeaDexBest, false);
  assert.deepStrictEqual(release.resolution, "1080p");
  assert.deepStrictEqual(release.trusted, true);
  assert.deepStrictEqual(toNyaaSearchResult(release).indexer, "Nyaa");
  assert.match(release.magnet, /^magnet:\?xt=urn:btih:[a-f0-9]+&dn=/);
  assert.match(release.infoHash, /^[a-f0-9]+$/);
  assert.deepStrictEqual(release.title.includes("Naruto Shippuden"), true);
});
