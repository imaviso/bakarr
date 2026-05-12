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
  readonly downloaded_episodes: number;
  readonly missing_episodes: number;
  readonly pending_downloads: number;
  readonly total_anime: number;
  readonly total_episodes: number;
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
        downloaded_episodes: stats.downloaded_episodes,
        missing_episodes: stats.missing_episodes,
        pending_downloads: status.pending_downloads,
        total_anime: stats.total_anime,
        total_episodes: stats.total_episodes,
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
    });

    return SystemRuntimeMetricsService.of({
      getRuntimeMetricsSummary,
      renderPrometheusMetrics,
    });
  }),
);
