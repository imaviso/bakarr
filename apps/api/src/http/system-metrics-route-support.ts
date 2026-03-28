import { Effect } from "effect";

import { MetricsService } from "../features/system/metrics-service.ts";
import { ClockService } from "../lib/clock.ts";
import { recordHttpRequestMetrics } from "../lib/metrics.ts";

export const renderSystemMetricsBody = Effect.fn("Http.renderSystemMetricsBody")(function* () {
  const clock = yield* ClockService;
  const metricsService = yield* MetricsService;
  const startedAt = yield* clock.currentMonotonicMillis;
  const body = yield* metricsService.renderPrometheusMetrics();
  const finishedAt = yield* clock.currentMonotonicMillis;

  yield* recordHttpRequestMetrics({
    durationMs: finishedAt - startedAt,
    method: "GET",
    route: "/api/metrics",
    status: 200,
  });

  return body;
});
