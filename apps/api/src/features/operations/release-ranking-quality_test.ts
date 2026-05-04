import { assert, it } from "@effect/vitest";

import {
  cutoffQuality,
  hasSourceMarkers,
  parseQualityFromTitle,
} from "@/features/operations/release-ranking-quality.ts";

it("parseQualityFromTitle combines source and resolution markers", () => {
  assert.deepStrictEqual(
    parseQualityFromTitle("[Group] Show - 01 [2160p Remux]").name,
    "BluRay 2160p Remux",
  );
  assert.deepStrictEqual(
    parseQualityFromTitle("[Group] Show - 01 [1080p WEBRip]").name,
    "WEBRip 1080p",
  );
  assert.deepStrictEqual(
    parseQualityFromTitle("[Group] Show - 01 [720p AMZN]").name,
    "WEB-DL 720p",
  );
  assert.deepStrictEqual(parseQualityFromTitle("[Group] Show - 01 [DVD 576p]").name, "DVD 576p");
});

it("parseQualityFromTitle defaults source to WEB-DL when only resolution exists", () => {
  assert.deepStrictEqual(parseQualityFromTitle("[Group] Show - 01 [1080p]").name, "WEB-DL 1080p");
  assert.deepStrictEqual(parseQualityFromTitle("[Group] Show - 01").name, "Unknown");
});

it("cutoffQuality resolves labels through quality parsing and fallback", () => {
  assert.deepStrictEqual(cutoffQuality("1080p").name, "WEB-DL 1080p");
  assert.deepStrictEqual(cutoffQuality("unknown").name, "BluRay 1080p");
});

it("hasSourceMarkers detects source terms", () => {
  assert.deepStrictEqual(hasSourceMarkers("Show WEB-DL 1080p"), true);
  assert.deepStrictEqual(hasSourceMarkers("Show Crunchyroll 1080p"), true);
  assert.deepStrictEqual(hasSourceMarkers("Show 1080p"), false);
});
