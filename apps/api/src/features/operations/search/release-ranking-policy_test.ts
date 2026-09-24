import { Effect, Exit } from "effect";
import { assert, it } from "@effect/vitest";

import {
  brandQualityId,
  type DownloadAction,
  type UnitSearchResult,
  type Quality,
} from "@packages/shared/index.ts";

import {
  compareUnitSearchResults,
  validateQualityProfileSizeLabels,
} from "@/features/operations/search/release-ranking-policy.ts";

const web1080: Quality = {
  id: brandQualityId(1),
  name: "WEB-DL 1080p",
  rank: 7,
  resolution: 1080,
  source: "web",
};
const web720: Quality = {
  id: brandQualityId(2),
  name: "WEB-DL 720p",
  rank: 10,
  resolution: 720,
  source: "web",
};

function result(
  title: string,
  downloadAction: DownloadAction,
  overrides?: Partial<UnitSearchResult>,
) {
  return {
    download_action: downloadAction,
    group: "Group",
    indexer: "Nyaa",
    info_hash: title,
    leechers: 0,
    link: "magnet:?xt=urn:btih:test",
    publish_date: "2025-01-01T00:00:00.000Z",
    quality: "1080p",
    seeders: 10,
    size: 100,
    title,
    ...overrides,
  } satisfies UnitSearchResult;
}

it("compareUnitSearchResults prioritizes accept, upgrade, then reject actions", () => {
  const items = [
    result("reject", { Reject: { reason: "no" } }),
    result("upgrade", {
      Upgrade: {
        is_seadex: false,
        old_quality: web720,
        quality: web1080,
        reason: "better",
        score: 5,
      },
    }),
    result("accept", { Accept: { is_seadex: false, quality: web1080, score: 1 } }),
  ];

  assert.deepStrictEqual(
    items.toSorted(compareUnitSearchResults).map((item) => item.title),
    ["accept", "upgrade", "reject"],
  );
});

it("compareUnitSearchResults breaks ties by score, quality rank, seeders, then size", () => {
  const items = [
    result(
      "small",
      { Accept: { is_seadex: false, quality: web720, score: 10 } },
      { seeders: 10, size: 100 },
    ),
    result(
      "large",
      { Accept: { is_seadex: false, quality: web720, score: 10 } },
      { seeders: 10, size: 200 },
    ),
    result(
      "more-seeders",
      { Accept: { is_seadex: false, quality: web720, score: 10 } },
      { seeders: 20, size: 50 },
    ),
    result(
      "better-quality",
      { Accept: { is_seadex: false, quality: web1080, score: 10 } },
      { seeders: 1, size: 50 },
    ),
    result(
      "higher-score",
      { Accept: { is_seadex: false, quality: web720, score: 20 } },
      { seeders: 1, size: 50 },
    ),
  ];

  assert.deepStrictEqual(
    items.toSorted(compareUnitSearchResults).map((item) => item.title),
    ["higher-score", "better-quality", "more-seeders", "large", "small"],
  );
});

it("compareUnitSearchResults treats batch releases as last resort behind singles", () => {
  const single = result(
    "[SubsPlease] Super no Ura de Yani Suu Futari Mini - 12 (1080p)",
    { Accept: { is_seadex: false, quality: web1080, score: 20 } },
    { seeders: 2, size: 300_000_000, parsed_unit_numbers: [12] },
  );
  const batch = result(
    "[SubsPlease] Super no Ura de Yani Suu Futari Mini (01-12) (1080p) [Batch]",
    { Accept: { is_seadex: false, quality: web1080, score: 70 } },
    {
      seeders: 50,
      size: 3_000_000_000,
      parsed_unit_numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
  );

  assert.deepStrictEqual(
    [batch, single].toSorted(compareUnitSearchResults).map((item) => item.title),
    [single.title, batch.title],
  );
});

it.effect("validateQualityProfileSizeLabels accepts valid ranges and rejects inverted ranges", () =>
  Effect.gen(function* () {
    const valid = yield* Effect.exit(
      validateQualityProfileSizeLabels({
        allowed_qualities: ["1080p"],
        cutoff: "1080p",
        max_size: "2 GiB",
        min_size: "1 GiB",
        name: "Default",
        seadex_preferred: true,
        upgrade_allowed: true,
      }),
    );
    const invalid = yield* Effect.exit(
      validateQualityProfileSizeLabels({
        allowed_qualities: ["1080p"],
        cutoff: "1080p",
        max_size: "1 GiB",
        min_size: "2 GiB",
        name: "Default",
        seadex_preferred: true,
        upgrade_allowed: true,
      }),
    );

    assert.deepStrictEqual(Exit.isSuccess(valid), true);
    assert.deepStrictEqual(Exit.isFailure(invalid), true);
  }),
);
