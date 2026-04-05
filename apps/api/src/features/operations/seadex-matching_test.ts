import { assert, it } from "@effect/vitest";

import type { ParsedRelease } from "@/features/operations/rss-client-parse.ts";
import { applySeaDexMatch, findSeaDexReleaseMatch } from "@/features/operations/seadex-matching.ts";
import type { SeaDexEntry, SeaDexRelease } from "@/features/operations/seadex-client.ts";

it("findSeaDexReleaseMatch matches by info hash first", () => {
  const release = makeRelease({
    infoHash: "abcdef0123456789abcdef0123456789abcdef01",
    viewUrl: "https://nyaa.si/view/123456",
  });
  const candidates = [
    makeSeaDexRelease({
      infoHash: "abcdef0123456789abcdef0123456789abcdef01",
      isBest: true,
      releaseGroup: "SubsPlease",
    }),
  ];

  assert.deepStrictEqual(findSeaDexReleaseMatch(release, candidates), candidates[0]);
});

it("findSeaDexReleaseMatch can match via tracker URL when hash is missing", () => {
  const release = makeRelease({
    infoHash: "",
    title: "[SomeGroup] Naruto - 01 (1080p)",
    viewUrl: "https://nyaa.si/view/555123",
  });
  const candidates = [
    makeSeaDexRelease({
      infoHash: undefined,
      isBest: true,
      releaseGroup: "DifferentGroup",
      tracker: "Nyaa",
      url: "https://nyaa.si/download/555123.torrent",
    }),
  ];

  assert.deepStrictEqual(findSeaDexReleaseMatch(release, candidates), candidates[0]);
});

it("findSeaDexReleaseMatch falls back to best-scored group match", () => {
  const release = makeRelease({
    infoHash: "",
    title: "[SubsPlease] Naruto - 01 (1080p) [Multi Audio]",
    group: "SubsPlease",
    viewUrl: "https://nyaa.si/view/999001",
  });
  const candidates = [
    makeSeaDexRelease({
      infoHash: undefined,
      dualAudio: false,
      isBest: false,
      releaseGroup: "SubsPlease",
    }),
    makeSeaDexRelease({
      infoHash: undefined,
      dualAudio: true,
      isBest: true,
      releaseGroup: "SubsPlease",
    }),
  ];

  assert.deepStrictEqual(findSeaDexReleaseMatch(release, candidates), candidates[1]);
});

it("findSeaDexReleaseMatch does not match on tracker alone", () => {
  const release = makeRelease({
    infoHash: "",
    group: "EMBER",
    title: "[EMBER] Yofukashi no Uta S2 - 12 [1080p]",
    viewUrl: "https://nyaa.si/view/999001",
  });
  const candidates = [
    makeSeaDexRelease({
      isBest: true,
      releaseGroup: "Okay-Subs",
      tracker: "Nyaa",
    }),
  ];

  assert.deepStrictEqual(findSeaDexReleaseMatch(release, candidates), undefined);
});

it("applySeaDexMatch annotates parsed release with SeaDex metadata", () => {
  const release = makeRelease({
    infoHash: "",
    title: "[SubsPlease] Naruto - 01 (1080p)",
    group: "SubsPlease",
    viewUrl: "https://nyaa.si/view/123456",
  });
  const entry: SeaDexEntry = {
    alID: 20,
    comparison: "https://releases.moe/compare/naruto",
    incomplete: false,
    notes: "Preferred release",
    releases: [
      makeSeaDexRelease({
        infoHash: undefined,
        isBest: true,
        releaseGroup: "SubsPlease",
        tags: ["Best", "Dual Audio"],
        url: "https://nyaa.si/view/123456",
      }),
    ],
  };

  assert.deepStrictEqual(applySeaDexMatch(release, entry), {
    ...release,
    isSeaDex: true,
    isSeaDexBest: true,
    seaDexComparison: "https://releases.moe/compare/naruto",
    seaDexDualAudio: true,
    seaDexNotes: "Preferred release",
    seaDexReleaseGroup: "SubsPlease",
    seaDexTags: ["Best", "Dual Audio"],
  });
});

function makeRelease(overrides: Partial<ParsedRelease> = {}): ParsedRelease {
  return {
    group: "SubsPlease",
    infoHash: "abcdef0123456789abcdef0123456789abcdef01",
    isSeaDex: false,
    isSeaDexBest: false,
    leechers: 2,
    magnet: "magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01",
    pubDate: "2024-01-01T00:00:00.000Z",
    remake: false,
    resolution: "1080p",
    seeders: 50,
    size: "1.4 GiB",
    sizeBytes: 1503238554,
    title: "[SubsPlease] Naruto - 01 (1080p)",
    trusted: true,
    viewUrl: "https://nyaa.si/view/123456",
    ...overrides,
  };
}

function makeSeaDexRelease(overrides: Partial<SeaDexRelease> = {}): SeaDexRelease {
  return {
    dualAudio: true,
    groupedUrl: "https://releases.moe/collections/naruto",
    infoHash: "abcdef0123456789abcdef0123456789abcdef01",
    isBest: false,
    releaseGroup: "SubsPlease",
    tags: ["Best", "Dual Audio"],
    tracker: "Nyaa",
    url: "https://nyaa.si/view/123456",
    ...overrides,
  };
}
