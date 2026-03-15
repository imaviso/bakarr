import { assertEquals } from "@std/assert";

import { makeDefaultConfig } from "./defaults.ts";
import {
  backgroundJobNames,
  normalizeLevel,
  toBackgroundJobStatus,
} from "./support.ts";

Deno.test("system support normalizes levels and deduplicates job names", () => {
  assertEquals(normalizeLevel("warn"), "warn");
  assertEquals(normalizeLevel("success"), "success");
  assertEquals(normalizeLevel("debug"), "info");

  assertEquals(backgroundJobNames([{ name: "rss" }, { name: "custom" }]), [
    "custom",
    "download_sync",
    "library_scan",
    "rss",
    "unmapped_scan",
  ]);
});

Deno.test("system support derives background job schedule modes", () => {
  const config = { ...makeDefaultConfig("./test.sqlite"), profiles: [] };

  assertEquals(
    toBackgroundJobStatus(config, undefined, "download_sync").schedule_mode,
    "interval",
  );
  assertEquals(
    toBackgroundJobStatus(config, undefined, "rss").schedule_value,
    "30m",
  );
  assertEquals(
    toBackgroundJobStatus(config, undefined, "library_scan").schedule_value,
    "12h",
  );
  assertEquals(
    toBackgroundJobStatus(config, undefined, "unmapped_scan").schedule_value,
    "3s",
  );
  assertEquals(
    toBackgroundJobStatus(config, undefined, "custom_job").schedule_mode,
    "manual",
  );

  const cronConfig = {
    ...config,
    scheduler: {
      ...config.scheduler,
      cron_expression: "0 * * * *",
    },
  };
  assertEquals(
    toBackgroundJobStatus(cronConfig, undefined, "rss").schedule_mode,
    "cron",
  );

  const disabledConfig = {
    ...config,
    scheduler: {
      ...config.scheduler,
      check_interval_minutes: 0,
      enabled: false,
    },
    library: {
      ...config.library,
      auto_scan_interval_hours: 0,
    },
  };
  assertEquals(
    toBackgroundJobStatus(disabledConfig, undefined, "rss").schedule_mode,
    "disabled",
  );
  assertEquals(
    toBackgroundJobStatus(disabledConfig, undefined, "library_scan")
      .schedule_mode,
    "disabled",
  );
});
