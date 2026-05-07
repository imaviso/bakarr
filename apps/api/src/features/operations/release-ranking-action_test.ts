import type { Config, QualityProfile, ReleaseProfileRule } from "@packages/shared/index.ts";
import { Option } from "effect";
import { assert, it } from "@effect/vitest";

import { decideDownloadAction } from "@/features/operations/release-ranking-action.ts";
import type {
  RankedCurrentEpisode,
  RankedRelease,
} from "@/features/operations/release-ranking-types.ts";
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

function makeRelease(overrides: Partial<RankedRelease> = {}): RankedRelease {
  return {
    group: "TestGroup",
    isSeaDex: false,
    isSeaDexBest: false,
    remake: false,
    seeders: 5,
    sizeBytes: 1024 * 1024 * 1024,
    title: "[TestGroup] Anime - 01 [1080p WEB-DL]",
    trusted: false,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return { ...makeTestConfig("./test.sqlite"), ...overrides };
}

it("decideDownloadAction accepts new download when no current episode", () => {
  const action = decideDownloadAction(
    makeProfile(),
    [],
    Option.none(),
    makeRelease(),
    makeConfig(),
  );
  assert.ok(action.Accept !== undefined);
  assert.deepStrictEqual(action.Accept.quality.name, "WEB-DL 1080p");
});

it("decideDownloadAction rejects when quality not in profile allowed_qualities", () => {
  const action = decideDownloadAction(
    makeProfile({ allowed_qualities: ["720p"] }),
    [],
    Option.none(),
    makeRelease(),
    makeConfig(),
  );
  assert.ok(action.Reject !== undefined);
  assert.deepStrictEqual(action.Reject.reason, "quality not allowed in profile");
});

it("decideDownloadAction rejects when size too small", () => {
  const action = decideDownloadAction(
    makeProfile({ min_size: "10 GiB" }),
    [],
    Option.none(),
    makeRelease({ sizeBytes: 1024 }),
    makeConfig(),
  );
  assert.ok(action.Reject !== undefined);
  assert.deepStrictEqual(action.Reject.reason, "size too small");
});

it("decideDownloadAction rejects when size too big", () => {
  const action = decideDownloadAction(
    makeProfile({ max_size: "1 MiB" }),
    [],
    Option.none(),
    makeRelease({ sizeBytes: 1024 * 1024 * 100 }),
    makeConfig(),
  );
  assert.ok(action.Reject !== undefined);
  assert.deepStrictEqual(action.Reject.reason, "size too big");
});

it("decideDownloadAction rejects when must rule is not satisfied", () => {
  const rules: ReleaseProfileRule[] = [{ term: "HEVC", score: 0, rule_type: "must" }];
  const action = decideDownloadAction(
    makeProfile(),
    rules,
    Option.none(),
    makeRelease({ title: "[TestGroup] Anime - 01 [1080p WEB-DL]" }),
    makeConfig(),
  );
  assert.ok(action.Reject !== undefined);
  assert.ok(action.Reject.reason.includes("Missing required term"));
});

it("decideDownloadAction rejects when must_not rule is violated", () => {
  const rules: ReleaseProfileRule[] = [{ term: "WEB-DL", score: 0, rule_type: "must_not" }];
  const action = decideDownloadAction(
    makeProfile(),
    rules,
    Option.none(),
    makeRelease(),
    makeConfig(),
  );
  assert.ok(action.Reject !== undefined);
  assert.ok(action.Reject.reason.includes("Contains forbidden term"));
});

it("decideDownloadAction rejects upgrade when upgrades disabled", () => {
  const current: RankedCurrentEpisode = {
    downloaded: true,
    filePath: "[OldGroup] Anime - 01 [720p HDTV].mkv",
  };
  const action = decideDownloadAction(
    makeProfile({ upgrade_allowed: false }),
    [],
    Option.some(current),
    makeRelease({ title: "[TestGroup] Anime - 01 [1080p BluRay]" }),
    makeConfig(),
  );
  assert.ok(action.Reject !== undefined);
  assert.deepStrictEqual(action.Reject.reason, "upgrades disabled");
});

it("decideDownloadAction rejects when already at quality cutoff", () => {
  const current: RankedCurrentEpisode = {
    downloaded: true,
    filePath: "[TestGroup] Anime - 01 [1080p BluRay].mkv",
  };
  const action = decideDownloadAction(
    makeProfile({ cutoff: "720p" }),
    [],
    Option.some(current),
    makeRelease({ title: "[TestGroup] Anime - 01 [1080p WEB-DL]" }),
    makeConfig(),
  );
  assert.ok(action.Reject !== undefined);
  assert.deepStrictEqual(action.Reject.reason, "already at quality cutoff");
});

it("decideDownloadAction upgrades when better quality available", () => {
  const current: RankedCurrentEpisode = {
    downloaded: true,
    filePath: "[OldGroup] Anime - 01 [720p HDTV].mkv",
  };
  const action = decideDownloadAction(
    makeProfile({ cutoff: "BluRay 2160p Remux" }),
    [],
    Option.some(current),
    makeRelease({ title: "[TestGroup] Anime - 01 [1080p BluRay]" }),
    makeConfig(),
  );
  assert.ok(action.Upgrade !== undefined);
  assert.deepStrictEqual(action.Upgrade.reason, "better quality available");
});

it("decideDownloadAction upgrades when SeaDex preferred and current is not", () => {
  const current: RankedCurrentEpisode = {
    downloaded: true,
    filePath: "[OldGroup] Anime - 01 [1080p WEB-DL].mkv",
  };
  const action = decideDownloadAction(
    makeProfile({ seadex_preferred: true, cutoff: "BluRay 2160p Remux" }),
    [],
    Option.some(current),
    makeRelease({ title: "[TestGroup] Anime - 01 [1080p WEB-DL]", isSeaDex: true }),
    makeConfig(),
  );
  assert.ok(action.Upgrade !== undefined);
  assert.deepStrictEqual(action.Upgrade.reason, "SeaDex release available");
});

it("decideDownloadAction rejects when no quality improvement", () => {
  const current: RankedCurrentEpisode = {
    downloaded: true,
    filePath: "[TestGroup] Anime - 01 [1080p WEB-DL].mkv",
  };
  const action = decideDownloadAction(
    makeProfile({ cutoff: "BluRay 2160p Remux" }),
    [],
    Option.some(current),
    makeRelease({ title: "[OtherGroup] Anime - 01 [1080p WEBRip]" }),
    makeConfig(),
  );
  assert.ok(action.Reject !== undefined);
  assert.deepStrictEqual(action.Reject.reason, "no quality improvement");
});
