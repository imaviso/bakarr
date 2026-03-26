import { Schema } from "effect";

export const BACKGROUND_WORKER_NAMES = [
  "download_sync",
  "rss",
  "library_scan",
  "metadata_refresh",
] as const;

export const BACKGROUND_JOB_NAMES = [...BACKGROUND_WORKER_NAMES, "unmapped_scan"] as const;

export const BackgroundWorkerNameSchema = Schema.Literal(...BACKGROUND_WORKER_NAMES);

export type BackgroundWorkerName = Schema.Schema.Type<typeof BackgroundWorkerNameSchema>;

export class BackgroundWorkerStatsModel extends Schema.Class<BackgroundWorkerStatsModel>(
  "BackgroundWorkerStatsModel",
)({
  daemonRunning: Schema.Boolean,
  failureCount: Schema.Number,
  lastErrorMessage: Schema.NullOr(Schema.String),
  lastFailedAt: Schema.NullOr(Schema.String),
  lastStartedAt: Schema.NullOr(Schema.String),
  lastSucceededAt: Schema.NullOr(Schema.String),
  runRunning: Schema.Boolean,
  skipCount: Schema.Number,
  successCount: Schema.Number,
}) {}

export type BackgroundWorkerStats = Schema.Schema.Type<typeof BackgroundWorkerStatsModel>;

export class BackgroundWorkerSnapshotModel extends Schema.Class<BackgroundWorkerSnapshotModel>(
  "BackgroundWorkerSnapshotModel",
)({
  download_sync: BackgroundWorkerStatsModel,
  library_scan: BackgroundWorkerStatsModel,
  metadata_refresh: BackgroundWorkerStatsModel,
  rss: BackgroundWorkerStatsModel,
}) {}

export type BackgroundWorkerSnapshot = Schema.Schema.Type<typeof BackgroundWorkerSnapshotModel>;

export function emptyBackgroundWorkerStats(): BackgroundWorkerStats {
  return new BackgroundWorkerStatsModel({
    daemonRunning: false,
    failureCount: 0,
    lastErrorMessage: null,
    lastFailedAt: null,
    lastStartedAt: null,
    lastSucceededAt: null,
    runRunning: false,
    skipCount: 0,
    successCount: 0,
  });
}

export function initialBackgroundWorkerSnapshot(): BackgroundWorkerSnapshot {
  return new BackgroundWorkerSnapshotModel({
    download_sync: emptyBackgroundWorkerStats(),
    library_scan: emptyBackgroundWorkerStats(),
    metadata_refresh: emptyBackgroundWorkerStats(),
    rss: emptyBackgroundWorkerStats(),
  });
}
