import { assert, it } from "@effect/vitest";

import { parseAbsoluteIdentity } from "@/infra/media/identity/absolute.ts";

it("parseAbsoluteIdentity parses explicit episode markers and brackets", () => {
  assert.deepStrictEqual(parseAbsoluteIdentity("Show - E12", "Show - E12.mkv")?.unit_numbers, [12]);
  assert.deepStrictEqual(
    parseAbsoluteIdentity("[Group] Show [07]", "[Group] Show [07].mkv")?.label,
    "07",
  );
});

it("parseAbsoluteIdentity parses safe absolute ranges", () => {
  const parsed = parseAbsoluteIdentity(
    "[Group] Show - 03-05 [1080p]",
    "[Group] Show - 03-05 [1080p].mkv",
  );

  assert.deepStrictEqual(parsed?.scheme, "absolute");
  assert.deepStrictEqual(parsed?.unit_numbers, [3, 4, 5]);
  assert.deepStrictEqual(parsed?.label, "03-05");
});

it("parseAbsoluteIdentity avoids years and season-only fallbacks", () => {
  assert.deepStrictEqual(parseAbsoluteIdentity("Show 2025", "Show 2025.mkv"), undefined);
  assert.deepStrictEqual(
    parseAbsoluteIdentity("Show Season 2", "Show Season 2 [1080p].mkv", {
      avoidSeasonOnlyFallback: true,
    }),
    undefined,
  );
  assert.deepStrictEqual(
    parseAbsoluteIdentity("Show Season 2", "Show Season 2.mkv", {
      avoidSeasonOnlyFallback: true,
    }),
    undefined,
  );
});
