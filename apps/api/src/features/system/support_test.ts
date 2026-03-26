import { assertEquals, it } from "../../test/vitest.ts";

import { makeTestConfig } from "../../test/config-fixture.ts";
import { backgroundJobNames, normalizeLevel, toBackgroundJobStatus } from "./support.ts";

it("system support normalizes levels and deduplicates job names", () => {
  assertEquals(normalizeLevel("warn"), "warn");
  assertEquals(normalizeLevel("success"), "success");
  assertEquals(normalizeLevel("debug"), "info");

  assertEquals(backgroundJobNames([{ name: "rss" }, { name: "custom" }]), [
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

  assertEquals(toBackgroundJobStatus(config, undefined, "download_sync").schedule_mode, "interval");
  assertEquals(toBackgroundJobStatus(config, undefined, "rss").schedule_value, "30m");
  assertEquals(toBackgroundJobStatus(config, undefined, "library_scan").schedule_value, "12h");
  assertEquals(toBackgroundJobStatus(config, undefined, "metadata_refresh").schedule_value, "24h");
  assertEquals(toBackgroundJobStatus(config, undefined, "unmapped_scan").schedule_mode, "manual");
  assertEquals(toBackgroundJobStatus(config, undefined, "custom_job").schedule_mode, "manual");

  const cronConfig = makeTestConfig("./test.sqlite", (c) => ({
    ...c,
    scheduler: { ...c.scheduler, cron_expression: "0 * * * *" },
  }));
  assertEquals(toBackgroundJobStatus(cronConfig, undefined, "rss").schedule_mode, "cron");

  const disabledConfig = makeTestConfig("./test.sqlite", (c) => ({
    ...c,
    scheduler: { ...c.scheduler, check_interval_minutes: 0, enabled: false },
    library: { ...c.library, auto_scan_interval_hours: 0 },
  }));
  assertEquals(toBackgroundJobStatus(disabledConfig, undefined, "rss").schedule_mode, "disabled");
  assertEquals(
    toBackgroundJobStatus(disabledConfig, undefined, "library_scan").schedule_mode,
    "disabled",
  );
  assertEquals(
    toBackgroundJobStatus(disabledConfig, undefined, "metadata_refresh").schedule_mode,
    "disabled",
  );
});
