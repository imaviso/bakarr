import * as Cron from "effect/Cron";
import { Either, Schema } from "effect";

import type { Config } from "@packages/shared/index.ts";

const DEFAULT_DOWNLOAD_SYNC_MS = 15_000;
export class BackgroundSchedule extends Schema.Class<BackgroundSchedule>("BackgroundSchedule")({
  downloadSyncMs: Schema.Number,
  initialDelayMs: Schema.Number,
  libraryScanMs: Schema.NullOr(Schema.Number),
  metadataRefreshMs: Schema.NullOr(Schema.Number),
  rssCheckMs: Schema.NullOr(Schema.Number),
  rssCronExpression: Schema.NullOr(Schema.String),
}) {}

export function buildBackgroundSchedule(config: Config): BackgroundSchedule {
  const cronExpression = config.scheduler.enabled
    ? config.scheduler.cron_expression?.trim() || null
    : null;
  const parsedCron = cronExpression ? Cron.parse(cronExpression) : null;
  const rssCronExpression = parsedCron && Either.isRight(parsedCron) ? cronExpression : null;

  return new BackgroundSchedule({
    initialDelayMs: Math.max(config.scheduler.check_delay_seconds, 0) * 1000,
    downloadSyncMs: DEFAULT_DOWNLOAD_SYNC_MS,
    libraryScanMs:
      config.library.auto_scan_interval_hours > 0
        ? config.library.auto_scan_interval_hours * 60 * 60 * 1000
        : null,
    metadataRefreshMs:
      config.scheduler.enabled && config.scheduler.metadata_refresh_hours > 0
        ? config.scheduler.metadata_refresh_hours * 60 * 60 * 1000
        : null,
    rssCronExpression,
    rssCheckMs:
      config.scheduler.enabled && !rssCronExpression && config.scheduler.check_interval_minutes > 0
        ? config.scheduler.check_interval_minutes * 60 * 1000
        : null,
  });
}
