import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { SystemMetricsEndpointService } from "@/features/system/system-metrics-endpoint-service.ts";
import { ClockService } from "@/lib/clock.ts";
import { recordHttpRequestMetrics } from "@/lib/metrics.ts";
import { authedRouteResponse } from "@/http/router-helpers.ts";

const METRICS_ROUTE = "/api/metrics";

const renderMetricsWithHttpMetrics = Effect.gen(function* () {
  const clock = yield* ClockService;
  const service = yield* SystemMetricsEndpointService;
  const startedAt = yield* clock.currentMonotonicMillis;
  const exit = yield* Effect.exit(service.renderMetricsEndpoint());
  const finishedAt = yield* clock.currentMonotonicMillis;
  const durationMs = finishedAt - startedAt;

  if (exit._tag === "Success") {
    yield* recordHttpRequestMetrics({
      durationMs,
      method: "GET",
      route: METRICS_ROUTE,
      status: 200,
    });

    return exit.value;
  }

  yield* recordHttpRequestMetrics({
    durationMs,
    method: "GET",
    route: METRICS_ROUTE,
    status: 500,
  });

  return yield* Effect.failCause(exit.cause);
});

export const systemMetricsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    METRICS_ROUTE,
    authedRouteResponse(renderMetricsWithHttpMetrics, (body) =>
      Effect.succeed(
        HttpServerResponse.text(body, {
          contentType: "text/plain; version=0.0.4; charset=utf-8",
        }),
      ),
    ),
  ),
);
