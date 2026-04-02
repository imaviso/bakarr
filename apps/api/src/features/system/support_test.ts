import { assert, it } from "@effect/vitest";

import { makeTestConfig } from "@/test/config-fixture.ts";
import {
  backgroundJobNames,
  normalizeLevel,
  toBackgroundJobStatus,
} from "@/features/system/support.ts";

it("system support normalizes levels and deduplicates job names", () => {
  assert.deepStrictEqual(normalizeLevel("warn"), "warn");
  assert.deepStrictEqual(normalizeLevel("success"), "success");
  assert.deepStrictEqual(normalizeLevel("debug"), "info");

  assert.deepStrictEqual(backgroundJobNames([{ name: "rss" }, { name: "custom" }]), [
    "custom",
    "download_sync",
    "library_scan",
    "metadata_refresh",
    "rss",
    "unmapped_scan",
  ]);
});

it("system support derives background job schedule modes", () => {
  const config = makeTestConfig("./test.sqlite");

  assert.deepStrictEqual(
    toBackgroundJobStatus(config, undefined, "download_sync").schedule_mode,
    "interval",
  );
  assert.deepStrictEqual(toBackgroundJobStatus(config, undefined, "rss").schedule_value, "30m");
  assert.deepStrictEqual(
    toBackgroundJobStatus(config, undefined, "library_scan").schedule_value,
    "12h",
  );
  assert.deepStrictEqual(
    toBackgroundJobStatus(config, undefined, "metadata_refresh").schedule_value,
    "24h",
  );
  assert.deepStrictEqual(
    toBackgroundJobStatus(config, undefined, "unmapped_scan").schedule_mode,
    "manual",
  );
  assert.deepStrictEqual(
    toBackgroundJobStatus(config, undefined, "custom_job").schedule_mode,
    "manual",
  );

  const cronConfig = makeTestConfig("./test.sqlite", (c) => ({
    ...c,
    scheduler: { ...c.scheduler, cron_expression: "0 * * * *" },
  }));
  assert.deepStrictEqual(toBackgroundJobStatus(cronConfig, undefined, "rss").schedule_mode, "cron");

  const disabledConfig = makeTestConfig("./test.sqlite", (c) => ({
    ...c,
    scheduler: { ...c.scheduler, check_interval_minutes: 0, enabled: false },
    library: { ...c.library, auto_scan_interval_hours: 0 },
  }));
  assert.deepStrictEqual(
    toBackgroundJobStatus(disabledConfig, undefined, "rss").schedule_mode,
    "disabled",
  );
  assert.deepStrictEqual(
    toBackgroundJobStatus(disabledConfig, undefined, "library_scan").schedule_mode,
    "disabled",
  );
  assert.deepStrictEqual(
    toBackgroundJobStatus(disabledConfig, undefined, "metadata_refresh").schedule_mode,
    "disabled",
  );
});
