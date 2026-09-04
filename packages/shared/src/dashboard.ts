// Shared ops dashboard wire contracts.
import { Schema } from "effect";
import { BackgroundJobStatusSchema, type BackgroundJobStatus } from "./jobs.ts";
import { DownloadEventSchema, type DownloadEvent } from "./events.ts";

export interface OpsDashboard {
  queued_downloads: number;
  active_downloads: number;
  failed_downloads: number;
  imported_downloads: number;
  running_jobs: number;
  recent_download_events: DownloadEvent[];
  jobs: BackgroundJobStatus[];
}

export const OpsDashboardSchema = Schema.Struct({
  queued_downloads: Schema.Number,
  active_downloads: Schema.Number,
  failed_downloads: Schema.Number,
  imported_downloads: Schema.Number,
  running_jobs: Schema.Number,
  recent_download_events: Schema.mutable(Schema.Array(DownloadEventSchema)),
  jobs: Schema.mutable(Schema.Array(BackgroundJobStatusSchema)),
});
