import type { Config, QualityProfile } from "@packages/shared/index.ts";
import { assert, it } from "@effect/vitest";
import { Option } from "effect";

import { rankUnitReleases } from "@/features/operations/search/release-ranking.ts";
import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";

function makeProfile(overrides: Partial<QualityProfile> = {}): QualityProfile {
  return {
    allowed_qualities: [],
    cutoff: "BluRay 1080p",
    max_size: null,
    min_size: null,
    name: "Any",
    seadex_preferred: false,
    upgrade_allowed: true,
    ...overrides,
  };
}

function makeRelease(title: string, overrides: Partial<ParsedRelease> = {}): ParsedRelease {
  return {
    infoHash: `hash-${title.length}`,
    isSeaDex: false,
    isSeaDexBest: false,
    leechers: 1,
    magnet: "magnet:?xt=urn:btih:abc",
    pubDate: "2026-01-01",
    remake: false,
    seeders: 5,
    size: "1.0 GiB",
    sizeBytes: 1024 * 1024 * 1024,
    title,
    trusted: false,
    viewUrl: "https://nyaa.si/view/1",
    ...overrides,
  };
}

function makeConfig(): Config {
  return makeTestConfig("./test.sqlite");
}

it("rankUnitReleases orders accept before reject and shapes results", () => {
  const results = rankUnitReleases({
    releases: [
      makeRelease("[BadGroup] Media - 01 [480p HDTV]"),
      makeRelease("[TestGroup] Media - 01 [1080p WEB-DL]"),
    ],
    currentUnit: Option.none(),
    profile: makeProfile({ allowed_qualities: ["1080p"] }),
    rules: [],
    runtimeConfig: makeConfig(),
  });

  assert.deepStrictEqual(results.length, 2);
  assert.deepStrictEqual(results[0]?.title, "[TestGroup] Media - 01 [1080p WEB-DL]");
  assert.ok(results[0]?.download_action.Accept != null);
  assert.deepStrictEqual(results[0]?.quality, "WEB-DL 1080p");
  assert.deepStrictEqual(results[0]?.indexer, "Nyaa");
  assert.ok(results[1]?.download_action.Reject != null);
});

it("rankUnitReleases rejects upgrades when the profile disables them", () => {
  const results = rankUnitReleases({
    releases: [makeRelease("[TestGroup] Media - 01 [1080p WEB-DL]")],
    currentUnit: Option.some({ downloaded: true, filePath: "/library/Media - 01.mkv" }),
    profile: makeProfile({ upgrade_allowed: false }),
    rules: [],
    runtimeConfig: makeConfig(),
  });

  assert.deepStrictEqual(results.length, 1);
  assert.deepStrictEqual(results[0]?.download_action.Reject?.reason, "upgrades disabled");
});

it("rankUnitReleases accepts unknown quality for volume releases", () => {
  const results = rankUnitReleases({
    releases: [makeRelease("Witch Hat Atelier Vol. 07 [Digital].cbz")],
    currentUnit: Option.none(),
    profile: makeProfile({ allowed_qualities: ["1080p"] }),
    rules: [],
    runtimeConfig: makeConfig(),
    unitKind: "volume",
  });

  assert.deepStrictEqual(results.length, 1);
  assert.ok(results[0]?.download_action.Accept != null);
});
