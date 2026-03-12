import * as Cron from "effect/Cron";
import { Either } from "effect";

import type { Config } from "../../../packages/shared/src/index.ts";

const DEFAULT_DOWNLOAD_SYNC_MS = 15_000;

export interface BackgroundSchedule {
  readonly initialDelayMs: number;
  readonly downloadSyncMs: number;
  readonly libraryScanMs: number | null;
  readonly rssCronExpression: string | null;
  readonly rssCheckMs: number | null;
}

export function buildBackgroundSchedule(config: Config): BackgroundSchedule {
  const cronExpression = config.scheduler.enabled
    ? config.scheduler.cron_expression?.trim() || null
    : null;
  const parsedCron = cronExpression ? Cron.parse(cronExpression) : null;
  const rssCronExpression = parsedCron && Either.isRight(parsedCron)
    ? cronExpression
    : null;

  return {
    initialDelayMs: Math.max(config.scheduler.check_delay_seconds, 0) * 1000,
    downloadSyncMs: DEFAULT_DOWNLOAD_SYNC_MS,
    libraryScanMs: config.library.auto_scan_interval_hours > 0
      ? config.library.auto_scan_interval_hours * 60 * 60 * 1000
      : null,
    rssCronExpression,
    rssCheckMs: config.scheduler.enabled && !rssCronExpression &&
        config.scheduler.check_interval_minutes > 0
      ? config.scheduler.check_interval_minutes * 60 * 1000
      : null,
  };
}
