import { assert, it } from "@effect/vitest";

import { normalizeSourceText } from "@/infra/media/identity/normalize.ts";

it("normalizeSourceText normalizes full-width brackets and season markers", () => {
  assert.deepStrictEqual(
    normalizeSourceText("【Group】 Show S02 第03話 END"),
    "[Group] Show Season 2 03",
  );
});

it("normalizeSourceText rewrites common bracketed Chinese media release layouts", () => {
  assert.deepStrictEqual(
    normalizeSourceText("[Group][中文名/English Title][2025][03][1080p]"),
    "[Group] English Title - 03[1080p]",
  );
});

it("normalizeSourceText extracts latin alias from mixed Han titles", () => {
  assert.deepStrictEqual(
    normalizeSourceText("[Group][English Title 中文名][03][1080p]"),
    "[Group] English Title - 03[1080p]",
  );
});
