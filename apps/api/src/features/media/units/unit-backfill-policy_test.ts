import { assert, it } from "@effect/vitest";

import {
  MAX_INFERRED_EPISODE_NUMBER,
  clampInferredEpisodeUpperBound,
} from "@/features/media/units/unit-backfill-policy.ts";

it("clampInferredEpisodeUpperBound returns undefined for non-positive-integer", () => {
  assert.deepStrictEqual(clampInferredEpisodeUpperBound(undefined), undefined);
  assert.deepStrictEqual(clampInferredEpisodeUpperBound(0), undefined);
  assert.deepStrictEqual(clampInferredEpisodeUpperBound(-1), undefined);
  assert.deepStrictEqual(clampInferredEpisodeUpperBound(1.5), undefined);
  assert.deepStrictEqual(clampInferredEpisodeUpperBound(Number.NaN), undefined);
  assert.deepStrictEqual(clampInferredEpisodeUpperBound(Number.POSITIVE_INFINITY), undefined);
});

it("clampInferredEpisodeUpperBound passes values within bound", () => {
  assert.deepStrictEqual(clampInferredEpisodeUpperBound(1), 1);
  assert.deepStrictEqual(clampInferredEpisodeUpperBound(13), 13);
  assert.deepStrictEqual(
    clampInferredEpisodeUpperBound(MAX_INFERRED_EPISODE_NUMBER),
    MAX_INFERRED_EPISODE_NUMBER,
  );
});

it("clampInferredEpisodeUpperBound caps values above MAX_INFERRED_EPISODE_NUMBER", () => {
  assert.deepStrictEqual(
    clampInferredEpisodeUpperBound(MAX_INFERRED_EPISODE_NUMBER + 1),
    MAX_INFERRED_EPISODE_NUMBER,
  );
  assert.deepStrictEqual(clampInferredEpisodeUpperBound(5000), MAX_INFERRED_EPISODE_NUMBER);
});
