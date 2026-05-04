import { assert, it } from "@effect/vitest";

import { buildBackgroundSchedule, resolveBackgroundWorkerLoopPlan } from "@/background/schedule.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";

it("buildBackgroundSchedule converts enabled intervals to milliseconds", () => {
  const config = makeTestConfig("./test.sqlite", (base) => ({
    ...base,
    library: { ...base.library, auto_scan_interval_hours: 2 },
    scheduler: {
      ...base.scheduler,
      check_delay_seconds: 3,
      check_interval_minutes: 10,
      cron_expression: null,
      enabled: true,
      metadata_refresh_hours: 6,
    },
  }));

  const schedule = buildBackgroundSchedule(config);

  assert.deepStrictEqual(schedule.initialDelayMs, 3_000);
  assert.deepStrictEqual(schedule.downloadSyncMs, 15_000);
  assert.deepStrictEqual(schedule.rssCheckMs, 600_000);
  assert.deepStrictEqual(schedule.libraryScanMs, 7_200_000);
  assert.deepStrictEqual(schedule.metadataRefreshMs, 21_600_000);
});

it("buildBackgroundSchedule disables scheduler-bound workers when scheduler is disabled", () => {
  const config = makeTestConfig("./test.sqlite", (base) => ({
    ...base,
    scheduler: { ...base.scheduler, enabled: false },
  }));

  const schedule = buildBackgroundSchedule(config);

  assert.deepStrictEqual(schedule.rssCheckMs, null);
  assert.deepStrictEqual(schedule.rssCronExpression, null);
  assert.deepStrictEqual(schedule.metadataRefreshMs, null);
});

it("resolveBackgroundWorkerLoopPlan resolves interval, cron, and disabled workers", () => {
  const config = makeTestConfig("./test.sqlite", (base) => ({
    ...base,
    library: { ...base.library, auto_scan_interval_hours: 0 },
    scheduler: {
      ...base.scheduler,
      check_delay_seconds: 5,
      cron_expression: "0 * * * *",
      enabled: true,
    },
  }));
  const schedule = buildBackgroundSchedule(config);

  assert.deepStrictEqual(resolveBackgroundWorkerLoopPlan(schedule, "download_sync"), {
    intervalMs: 15_000,
  });
  assert.deepStrictEqual(resolveBackgroundWorkerLoopPlan(schedule, "rss"), {
    cronExpression: "0 * * * *",
    initialDelayMs: 5_000,
  });
  assert.deepStrictEqual(resolveBackgroundWorkerLoopPlan(schedule, "library_scan"), null);
});
