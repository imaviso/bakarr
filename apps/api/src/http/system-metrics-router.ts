import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { MetricsService } from "../features/system/metrics-service.ts";
import { ClockService } from "../lib/clock.ts";
import { recordHttpRequestMetrics } from "../lib/metrics.ts";
import { buildPrometheusMetricsResponse } from "./metrics-response.ts";
import { authedRouteResponse } from "./router-helpers.ts";

export const systemMetricsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/metrics",
    authedRouteResponse(
      Effect.gen(function* () {
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
      }),
      (body) => Effect.succeed(buildPrometheusMetricsResponse(body)),
    ),
  ),
);
