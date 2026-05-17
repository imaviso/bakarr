import { Context, Effect, Layer, Metric } from "effect";

import { renderBakarrPrometheusMetrics } from "@/infra/metrics.ts";
import {
  type SystemReadStatusError,
  SystemReadService,
} from "@/features/system/system-read-service.ts";
import type { DatabaseError } from "@/db/database.ts";

export interface RuntimeMetricsSummary {
  readonly active_download_items: number;
  readonly active_torrents: number;
  readonly downloaded_units: number;
  readonly missing_units: number;
  readonly pending_downloads: number;
  readonly total_media: number;
  readonly total_units: number;
}

export type SystemRuntimeMetricsError = SystemReadStatusError | DatabaseError;

export interface SystemRuntimeMetricsServiceShape {
  readonly getRuntimeMetricsSummary: () => Effect.Effect<
    RuntimeMetricsSummary,
    SystemRuntimeMetricsError
  >;
  readonly renderPrometheusMetrics: () => Effect.Effect<string, SystemRuntimeMetricsError>;
}

export class SystemRuntimeMetricsService extends Context.Tag(
  "@bakarr/api/SystemRuntimeMetricsService",
)<SystemRuntimeMetricsService, SystemRuntimeMetricsServiceShape>() {}

export const SystemRuntimeMetricsServiceLive = Layer.effect(
  SystemRuntimeMetricsService,
  Effect.gen(function* () {
    const systemReadService = yield* SystemReadService;

    const getRuntimeMetricsSummary = Effect.fn(
      "SystemRuntimeMetricsService.getRuntimeMetricsSummary",
    )(function* () {
      const [status, stats] = yield* Effect.all([
        systemReadService.getSystemStatus(),
        systemReadService.getLibraryStats(),
      ]);

      return {
        active_download_items: status.pending_downloads + status.active_torrents,
        active_torrents: status.active_torrents,
        downloaded_units: stats.downloaded_units,
        missing_units: stats.missing_units,
        pending_downloads: status.pending_downloads,
        total_media: stats.total_media,
        total_units: stats.total_units,
      } satisfies RuntimeMetricsSummary;
    });

    const renderPrometheusMetrics = Effect.fn(
      "SystemRuntimeMetricsService.renderPrometheusMetrics",
    )(function* () {
      const metricsSummary = yield* getRuntimeMetricsSummary();
      const snapshot = yield* Metric.snapshot;

      return (
        [
          "# TYPE bakarr_active_torrents gauge",
          `bakarr_active_torrents ${metricsSummary.active_torrents}`,
          "# TYPE bakarr_pending_downloads gauge",
          `bakarr_pending_downloads ${metricsSummary.pending_downloads}`,
          "# TYPE bakarr_total_media gauge",
          `bakarr_total_media ${metricsSummary.total_media}`,
          "# TYPE bakarr_total_units gauge",
          `bakarr_total_units ${metricsSummary.total_units}`,
          "# TYPE bakarr_downloaded_units gauge",
          `bakarr_downloaded_units ${metricsSummary.downloaded_units}`,
          "# TYPE bakarr_missing_units gauge",
          `bakarr_missing_units ${metricsSummary.missing_units}`,
          "# TYPE bakarr_active_download_items gauge",
          `bakarr_active_download_items ${metricsSummary.active_download_items}`,
          ...renderBakarrPrometheusMetrics(snapshot),
        ].join("\n") + "\n"
      );
    });

    return SystemRuntimeMetricsService.of({
      getRuntimeMetricsSummary,
      renderPrometheusMetrics,
    });
  }),
);
