import { Context, Effect, Layer, Metric } from "effect";

import { renderBakarrPrometheusMetrics } from "@/lib/metrics.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { DiskSpaceError } from "@/features/system/disk-space.ts";
import { BackgroundJobStatusError } from "@/features/system/background-job-status-service.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "@/features/system/errors.ts";
import { SystemReadService } from "@/features/system/system-read-service.ts";

export type MetricsServiceError =
  | BackgroundJobStatusError
  | DatabaseError
  | DiskSpaceError
  | StoredConfigCorruptError
  | StoredConfigMissingError;

export interface MetricsServiceShape {
  readonly renderPrometheusMetrics: () => Effect.Effect<string, MetricsServiceError>;
}

export class MetricsService extends Context.Tag("@bakarr/api/MetricsService")<
  MetricsService,
  MetricsServiceShape
>() {}

export const MetricsServiceLive = Layer.effect(
  MetricsService,
  Effect.gen(function* () {
    const systemReadService = yield* SystemReadService;

    const renderPrometheusMetrics = Effect.fn("MetricsService.renderPrometheusMetrics")(
      function* () {
        const metricsSummary = yield* systemReadService.getRuntimeMetricsSummary();
        const snapshot = yield* Metric.snapshot;

        return (
          [
            "# TYPE bakarr_active_torrents gauge",
            `bakarr_active_torrents ${metricsSummary.active_torrents}`,
            "# TYPE bakarr_pending_downloads gauge",
            `bakarr_pending_downloads ${metricsSummary.pending_downloads}`,
            "# TYPE bakarr_total_anime gauge",
            `bakarr_total_anime ${metricsSummary.total_anime}`,
            "# TYPE bakarr_total_episodes gauge",
            `bakarr_total_episodes ${metricsSummary.total_episodes}`,
            "# TYPE bakarr_downloaded_episodes gauge",
            `bakarr_downloaded_episodes ${metricsSummary.downloaded_episodes}`,
            "# TYPE bakarr_missing_episodes gauge",
            `bakarr_missing_episodes ${metricsSummary.missing_episodes}`,
            "# TYPE bakarr_active_download_items gauge",
            `bakarr_active_download_items ${metricsSummary.active_download_items}`,
            ...renderBakarrPrometheusMetrics(snapshot),
          ].join("\n") + "\n"
        );
      },
    );

    return { renderPrometheusMetrics } satisfies MetricsServiceShape;
  }),
);
