import { Context, Effect, Layer, Metric } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { renderBakarrPrometheusMetrics } from "@/lib/metrics.ts";
import { DownloadProgressService } from "@/features/operations/download-service-tags.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import { SystemStatusService } from "@/features/system/system-status-service.ts";
import type { DiskSpaceError } from "@/features/system/disk-space.ts";
import { BackgroundJobStatusError } from "@/features/system/background-job-status-service.ts";

export type MetricsServiceError =
  | DatabaseError
  | BackgroundJobStatusError
  | DiskSpaceError
  | OperationsError;

export interface MetricsServiceShape {
  readonly renderPrometheusMetrics: () => Effect.Effect<string, MetricsServiceError>;
}

export class MetricsService extends Context.Tag("@bakarr/api/MetricsService")<
  MetricsService,
  MetricsServiceShape
>() {}

const makeMetricsService = Effect.gen(function* () {
  const systemService = yield* SystemStatusService;
  const downloadProgressService = yield* DownloadProgressService;

  const renderPrometheusMetrics = Effect.fn("MetricsService.renderPrometheusMetrics")(function* () {
    const [status, stats, downloads] = yield* Effect.all([
      systemService.getSystemStatus(),
      systemService.getLibraryStats(),
      downloadProgressService.getDownloadProgress(),
    ]);
    const snapshot = yield* Metric.snapshot;

    return (
      [
        "# TYPE bakarr_active_torrents gauge",
        `bakarr_active_torrents ${status.active_torrents}`,
        "# TYPE bakarr_pending_downloads gauge",
        `bakarr_pending_downloads ${status.pending_downloads}`,
        "# TYPE bakarr_total_anime gauge",
        `bakarr_total_anime ${stats.total_anime}`,
        "# TYPE bakarr_total_episodes gauge",
        `bakarr_total_episodes ${stats.total_episodes}`,
        "# TYPE bakarr_downloaded_episodes gauge",
        `bakarr_downloaded_episodes ${stats.downloaded_episodes}`,
        "# TYPE bakarr_missing_episodes gauge",
        `bakarr_missing_episodes ${stats.missing_episodes}`,
        "# TYPE bakarr_active_download_items gauge",
        `bakarr_active_download_items ${downloads.length}`,
        ...renderBakarrPrometheusMetrics(snapshot),
      ].join("\n") + "\n"
    );
  });

  return { renderPrometheusMetrics } satisfies MetricsServiceShape;
});

export const MetricsServiceLive = Layer.effect(MetricsService, makeMetricsService);
