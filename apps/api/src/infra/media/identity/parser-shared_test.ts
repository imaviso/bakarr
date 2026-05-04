import { assert, it } from "@effect/vitest";

import {
  formatSeasonLabel,
  isValidDate,
  isYearLike,
  rangeArray,
} from "@/infra/media/identity/parser-shared.ts";

it("isYearLike accepts only anime metadata year range", () => {
  assert.deepStrictEqual(isYearLike(1899), false);
  assert.deepStrictEqual(isYearLike(1900), true);
  assert.deepStrictEqual(isYearLike(2100), true);
  assert.deepStrictEqual(isYearLike(2101), false);
});

it("isValidDate rejects overflow and out of range dates", () => {
  assert.deepStrictEqual(isValidDate(2024, 2, 29), true);
  assert.deepStrictEqual(isValidDate(2025, 2, 29), false);
  assert.deepStrictEqual(isValidDate(2025, 13, 1), false);
  assert.deepStrictEqual(isValidDate(1899, 1, 1), false);
});

it("rangeArray includes both endpoints", () => {
  assert.deepStrictEqual(rangeArray(3, 6), [3, 4, 5, 6]);
});

it("formatSeasonLabel handles empty, single, contiguous, and sparse episodes", () => {
  assert.deepStrictEqual(formatSeasonLabel(2, []), "S02");
  assert.deepStrictEqual(formatSeasonLabel(2, [3]), "S02E03");
  assert.deepStrictEqual(formatSeasonLabel(2, [4, 2, 3]), "S02E02-E04");
  assert.deepStrictEqual(formatSeasonLabel(2, [1, 3, 5]), "S02E01-S02E03-S02E05");
});
