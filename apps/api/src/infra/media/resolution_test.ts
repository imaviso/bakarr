import { assert, it } from "@effect/vitest";

import { parseResolutionLabel } from "@/infra/media/resolution.ts";

it("parseResolutionLabel detects common release resolutions", () => {
  assert.deepStrictEqual(parseResolutionLabel("Movie 4K HDR"), "2160p");
  assert.deepStrictEqual(parseResolutionLabel("Show [2160p]"), "2160p");
  assert.deepStrictEqual(parseResolutionLabel("Show 1080p WEB-DL"), "1080p");
  assert.deepStrictEqual(parseResolutionLabel("Show 720p"), "720p");
  assert.deepStrictEqual(parseResolutionLabel("DVD 576p"), "576p");
  assert.deepStrictEqual(parseResolutionLabel("SD 480p"), "480p");
  assert.deepStrictEqual(parseResolutionLabel("Show WEB-DL"), undefined);
});
