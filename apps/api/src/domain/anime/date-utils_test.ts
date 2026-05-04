import { assert, it } from "@effect/vitest";

import { deriveAnimeSeason, extractYearFromDate } from "@/domain/anime/date-utils.ts";

it("deriveAnimeSeason maps ISO month boundaries to anime seasons", () => {
  assert.deepStrictEqual(deriveAnimeSeason("2025-01-10"), "winter");
  assert.deepStrictEqual(deriveAnimeSeason("2025-03-10"), "spring");
  assert.deepStrictEqual(deriveAnimeSeason("2025-06-10"), "summer");
  assert.deepStrictEqual(deriveAnimeSeason("2025-09-10"), "fall");
  assert.deepStrictEqual(deriveAnimeSeason("2025-12-10"), "winter");
});

it("deriveAnimeSeason ignores missing or invalid dates", () => {
  assert.deepStrictEqual(deriveAnimeSeason(undefined), undefined);
  assert.deepStrictEqual(deriveAnimeSeason(null), undefined);
  assert.deepStrictEqual(deriveAnimeSeason(""), undefined);
  assert.deepStrictEqual(deriveAnimeSeason("2025-00-10"), undefined);
  assert.deepStrictEqual(deriveAnimeSeason("not-a-date"), undefined);
});

it("extractYearFromDate returns positive four digit years", () => {
  assert.deepStrictEqual(extractYearFromDate("2025-04-01"), 2025);
  assert.deepStrictEqual(extractYearFromDate("0000-04-01"), undefined);
  assert.deepStrictEqual(extractYearFromDate("bad"), undefined);
  assert.deepStrictEqual(extractYearFromDate(null), undefined);
});
