import * as Cron from "effect/Cron";
import { Either } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { DOWNLOAD_SYNC_INTERVAL_MS } from "@/background/schedule.ts";

export function normalizeLevel(level: string): "info" | "warn" | "error" | "success" {
  if (level === "warn" || level === "error" || level === "success") {
    return level;
  }

  return "info";
}

export function toBackgroundJobStatus(
  config: Config,
  row:
    | {
        isRunning: boolean;
        lastMessage: string | null;
        progressCurrent: number | null;
        progressTotal: number | null;
        lastRunAt: string | null;
        lastStatus: string | null;
        lastSuccessAt: string | null;
        name: string;
        runCount: number;
      }
    | undefined,
  name: string,
) {
  const schedule = describeJobSchedule(config, name);

  return {
    is_running: row?.isRunning ?? false,
    last_message: row?.lastMessage ?? undefined,
    progress_current: row?.progressCurrent ?? undefined,
    progress_total: row?.progressTotal ?? undefined,
    last_run_at: row?.lastRunAt ?? undefined,
    last_status: row?.lastStatus ?? undefined,
    last_success_at: row?.lastSuccessAt ?? undefined,
    name,
    run_count: row?.runCount ?? 0,
    schedule_mode: schedule.mode,
    schedule_value: schedule.value,
  };
}

function formatIntervalMs(intervalMs: number): string {
  return Number.isInteger(intervalMs / 1000) ? `${intervalMs / 1000}s` : `${intervalMs}ms`;
}

function describeJobSchedule(
  config: Config,
  name: string,
): {
  readonly mode: "interval" | "cron" | "disabled" | "manual";
  readonly value: string | undefined;
} {
  if (name === "download_sync") {
    return {
      mode: "interval",
      value: formatIntervalMs(DOWNLOAD_SYNC_INTERVAL_MS),
    };
  }

  if (name === "rss") {
    if (!config.scheduler.enabled) {
      return { mode: "disabled", value: undefined };
    }

    const expression = config.scheduler.cron_expression?.trim();
    if (expression) {
      const parsed = Cron.parse(expression);
      if (Either.isRight(parsed)) {
        return { mode: "cron", value: expression };
      }
    }

    if (config.scheduler.check_interval_minutes > 0) {
      return {
        mode: "interval",
        value: `${config.scheduler.check_interval_minutes}m`,
      };
    }

    return { mode: "disabled", value: undefined };
  }

  if (name === "library_scan") {
    if (config.library.auto_scan_interval_hours > 0) {
      return {
        mode: "interval",
        value: `${config.library.auto_scan_interval_hours}h`,
      };
    }

    return { mode: "disabled", value: undefined };
  }

  if (name === "metadata_refresh") {
    if (!config.scheduler.enabled) {
      return { mode: "disabled", value: undefined };
    }

    if (config.scheduler.metadata_refresh_hours > 0) {
      return {
        mode: "interval",
        value: `${config.scheduler.metadata_refresh_hours}h`,
      };
    }

    return { mode: "disabled", value: undefined };
  }

  if (name === "manami_refresh") {
    return config.scheduler.enabled
      ? { mode: "interval", value: "24h" }
      : { mode: "disabled", value: undefined };
  }

  if (name === "unmapped_scan") {
    return { mode: "manual", value: undefined };
  }

  return { mode: "manual", value: undefined };
}
