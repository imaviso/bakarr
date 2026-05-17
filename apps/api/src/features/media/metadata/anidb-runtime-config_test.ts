import { assert, it } from "@effect/vitest";

import { normalizeEpisodeCount } from "@/features/media/metadata/anidb.ts";

it("normalizeEpisodeCount falls back to episode limit when count is missing", () => {
  assert.deepStrictEqual(normalizeEpisodeCount(undefined, 200), 200);
});

it("normalizeEpisodeCount falls back to episode limit when count is invalid", () => {
  assert.deepStrictEqual(normalizeEpisodeCount(0, 120), 120);
  assert.deepStrictEqual(normalizeEpisodeCount(-4, 120), 120);
});

it("normalizeEpisodeCount caps to episode limit when count is known", () => {
  assert.deepStrictEqual(normalizeEpisodeCount(12, 200), 12);
  assert.deepStrictEqual(normalizeEpisodeCount(999, 200), 200);
});
