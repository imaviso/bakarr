import { assert, it } from "@effect/vitest";

import {
  DEFAULT_PROFILES,
  DEFAULT_QUALITIES,
  makeDefaultConfig,
} from "@/features/system/defaults.ts";

it("makeDefaultConfig embeds the requested database path and stable operational defaults", () => {
  const config = makeDefaultConfig("./custom.sqlite");

  assert.deepStrictEqual(config.general.database_path, "./custom.sqlite");
  assert.deepStrictEqual(config.scheduler.enabled, true);
  assert.deepStrictEqual(config.scheduler.check_interval_minutes, 30);
  assert.deepStrictEqual(config.downloads.root_path, "./downloads");
  assert.deepStrictEqual(config.library.preferred_title, "romaji");
  assert.deepStrictEqual(config.metadata?.anidb.enabled, false);
});

it("default profiles and qualities stay internally consistent", () => {
  assert.deepStrictEqual(DEFAULT_PROFILES[0]?.cutoff, "1080p");
  assert.deepStrictEqual(DEFAULT_PROFILES[0]?.allowed_qualities, ["1080p", "720p"]);
  assert.deepStrictEqual(
    DEFAULT_QUALITIES.map((quality) => quality.name),
    ["480p", "720p", "1080p", "2160p"],
  );
});
