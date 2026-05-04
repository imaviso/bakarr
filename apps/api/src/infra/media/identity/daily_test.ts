import { assert, it } from "@effect/vitest";

import { parseDailyIdentity } from "@/infra/media/identity/daily.ts";

it("parseDailyIdentity parses YMD and DMY dates", () => {
  assert.deepStrictEqual(parseDailyIdentity("Show.2025-03-14.1080p")?.air_dates, ["2025-03-14"]);
  assert.deepStrictEqual(parseDailyIdentity("Show 14.03.2025 1080p")?.air_dates, ["2025-03-14"]);
});

it("parseDailyIdentity rejects invalid dates", () => {
  assert.deepStrictEqual(parseDailyIdentity("Show.2025-02-29.1080p"), undefined);
  assert.deepStrictEqual(parseDailyIdentity("Show.31.04.2025.1080p"), undefined);
  assert.deepStrictEqual(parseDailyIdentity("Show.01.01.2200.1080p"), undefined);
});
