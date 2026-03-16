import { assertEquals, assertMatch } from "@std/assert";

import {
  fallbackReleases,
  mapSearchCategory,
  mapSearchFilter,
  toNyaaSearchResult,
} from "./search-support.ts";
import type { ParsedRelease } from "./rss-client.ts";

Deno.test("mapSearchCategory and mapSearchFilter use expected mappings and fallbacks", () => {
  assertEquals(mapSearchCategory("anime_english", "1_0"), "1_2");
  assertEquals(mapSearchCategory("unknown", "1_0"), "1_0");

  assertEquals(mapSearchFilter("trusted_only", "0"), "2");
  assertEquals(mapSearchFilter("unknown", "0"), "0");
});

Deno.test("toNyaaSearchResult preserves release fields and parses episode number", () => {
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

  assertEquals(result.info_hash, release.infoHash);
  assertEquals(result.parsed_group, "SubsPlease");
  assertEquals(result.parsed_episode, "1");
  assertEquals(result.parsed_resolution, "1080p");
  assertEquals(result.is_seadex, true);
  assertEquals(result.is_seadex_best, false);
  assertEquals(result.seadex_release_group, "SeaDexGroup");
  assertEquals(result.seadex_tags, ["Best", "Dual Audio"]);
  assertEquals(result.seadex_notes, "Preferred release");
  assertEquals(
    result.seadex_comparison,
    "https://releases.moe/compare/example",
  );
  assertEquals(result.seadex_dual_audio, true);
});

Deno.test("fallbackReleases builds a trusted placeholder release from title", () => {
  const [release] = fallbackReleases("naruto", "Naruto Shippuden");

  assertEquals(release.group, "SubsPlease");
  assertEquals(release.isSeaDex, false);
  assertEquals(release.isSeaDexBest, false);
  assertEquals(release.resolution, "1080p");
  assertEquals(release.trusted, true);
  assertMatch(release.magnet, /^magnet:\?xt=urn:btih:[a-f0-9]+&dn=/);
  assertMatch(release.infoHash, /^[a-f0-9]+$/);
  assertEquals(release.title.includes("Naruto Shippuden"), true);
});
