import * as Cron from "effect/Cron";
import { Effect, Either } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { eq, sql } from "drizzle-orm";

import { BACKGROUND_JOB_NAMES } from "@/background/worker-model.ts";
import type { AppDatabase } from "@/db/database.ts";
import { systemLogs } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

type NowIso<E = never> = () => Effect.Effect<string, E>;

export function normalizeLevel(level: string): "info" | "warn" | "error" | "success" {
  if (level === "warn" || level === "error" || level === "success") {
    return level;
  }

  return "info";
}

export function eventTypeCondition(eventType: string) {
  switch (eventType) {
    case "Scan":
      return sql`${systemLogs.eventType} like 'library.%' or ${systemLogs.eventType} like 'media.%scan%' or ${systemLogs.eventType} like 'system.task.scan%'`;
    case "Download":
      return sql`${systemLogs.eventType} like 'downloads.%'`;
    case "Import":
      return sql`${systemLogs.eventType} like 'library.%import%'`;
    case "RSS":
      return sql`${systemLogs.eventType} like 'rss.%' or ${systemLogs.eventType} like 'system.task.rss%'`;
    case "Metadata":
      return sql`${systemLogs.eventType} like 'system.task.metadata_refresh%' or ${systemLogs.eventType} like 'media.metadata%'`;
    case "Error":
      return eq(systemLogs.level, "error");
    default:
      return eq(systemLogs.eventType, eventType);
  }
}

export const appendSystemLog = Effect.fn("SystemSupport.appendSystemLog")(function* <E>(
  db: AppDatabase,
  eventType: string,
  level: string,
  message: string,
  nowIso: NowIso<E>,
) {
  const now = yield* nowIso();
  yield* tryDatabasePromise("Failed to append system log", () =>
    db.insert(systemLogs).values({
      createdAt: now,
      details: null,
      eventType,
      level,
      message,
    }),
  );
});

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

export function backgroundJobNames(rows: ReadonlyArray<{ name: string }>): string[] {
  return [...new Set([...BACKGROUND_JOB_NAMES, ...rows.map((row) => row.name)])].toSorted();
}

function describeJobSchedule(config: Config, name: string) {
  if (name === "download_sync") {
    return { mode: "interval" as const, value: "15s" };
  }

  if (name === "rss") {
    if (!config.scheduler.enabled) {
      return { mode: "disabled" as const, value: undefined };
    }

    const expression = config.scheduler.cron_expression?.trim();
    if (expression) {
      const parsed = Cron.parse(expression);
      if (Either.isRight(parsed)) {
        return { mode: "cron" as const, value: expression };
      }
    }

    if (config.scheduler.check_interval_minutes > 0) {
      return {
        mode: "interval" as const,
        value: `${config.scheduler.check_interval_minutes}m`,
      };
    }

    return { mode: "disabled" as const, value: undefined };
  }

  if (name === "library_scan") {
    if (config.library.auto_scan_interval_hours > 0) {
      return {
        mode: "interval" as const,
        value: `${config.library.auto_scan_interval_hours}h`,
      };
    }

    return { mode: "disabled" as const, value: undefined };
  }

  if (name === "metadata_refresh") {
    if (!config.scheduler.enabled) {
      return { mode: "disabled" as const, value: undefined };
    }

    if (config.scheduler.metadata_refresh_hours > 0) {
      return {
        mode: "interval" as const,
        value: `${config.scheduler.metadata_refresh_hours}h`,
      };
    }

    return { mode: "disabled" as const, value: undefined };
  }

  if (name === "unmapped_scan") {
    return { mode: "manual" as const, value: undefined };
  }

  return { mode: "manual" as const, value: undefined };
}
