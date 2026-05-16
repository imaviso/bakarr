import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Cause, Effect, Option } from "effect";

import { ObservabilityConfig } from "@/config/observability.ts";
import { SystemRuntimeMetricsService } from "@/features/system/system-runtime-metrics-service.ts";
import { requireViewerFromHttpRequest } from "@/http/shared/route-auth.ts";
import { mapRouteError } from "@/http/shared/route-errors/index.ts";
import { ClockService } from "@/infra/clock.ts";
import { recordHttpRequestMetrics } from "@/infra/metrics.ts";
import { routeResponse } from "@/http/shared/router-helpers.ts";

const METRICS_ROUTE = "/api/metrics";

const enforceMetricsAuthIfConfigured = Effect.gen(function* () {
  const config = yield* ObservabilityConfig;

  if (config.metricsRequireAuth) {
    yield* requireViewerFromHttpRequest();
  }
});

const renderMetricsWithHttpMetrics = Effect.gen(function* () {
  const clock = yield* ClockService;
  const service = yield* SystemRuntimeMetricsService;
  const startedAt = yield* clock.currentMonotonicMillis;
  const exit = yield* Effect.exit(
    Effect.zipRight(enforceMetricsAuthIfConfigured, service.renderPrometheusMetrics()),
  );
  const finishedAt = yield* clock.currentMonotonicMillis;
  const durationMs = finishedAt - startedAt;
  const status = exit._tag === "Success" ? 200 : statusFromFailureCause(exit.cause);

  yield* recordHttpRequestMetrics({
    durationMs,
    method: "GET",
    route: METRICS_ROUTE,
    status,
  });

  if (exit._tag === "Success") {
    return exit.value;
  }

  return yield* Effect.failCause(exit.cause);
});

function statusFromFailureCause(cause: Cause.Cause<unknown>) {
  return Option.match(Cause.failureOption(cause), {
    onNone: () => 500,
    onSome: (error) => mapRouteError(error).status,
  });
}

export const systemMetricsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    METRICS_ROUTE,
    routeResponse(
      renderMetricsWithHttpMetrics,
      (body) =>
        Effect.succeed(
          HttpServerResponse.text(body, {
            contentType: "text/plain; version=0.0.4; charset=utf-8",
          }),
        ),
      mapRouteError,
    ),
  ),
);
