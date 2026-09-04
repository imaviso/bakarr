// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Cause, Duration, Effect, Layer, Option } from "effect";

import { ObservabilityConfig } from "@/app/config/observability.ts";
import { SystemRuntimeMetricsService } from "@/features/system/system-runtime-metrics-service.ts";
import { requireViewerFromHttpRequest } from "@/infra/http/route-auth.ts";
import { mapRouteError } from "@/infra/http/route-errors/index.ts";
import { recordHttpRequestMetrics } from "@/infra/metrics.ts";
import { routeResponse } from "@/infra/http/router-helpers.ts";

const METRICS_ROUTE = "/api/metrics";

const enforceMetricsAuthIfConfigured = Effect.gen(function* () {
  const config = yield* ObservabilityConfig;

  if (config.metricsRequireAuth) {
    yield* requireViewerFromHttpRequest();
  }
});

const renderMetricsWithHttpMetrics = Effect.gen(function* () {
  const service = yield* SystemRuntimeMetricsService;
  const [duration, exit] = yield* Effect.timed(
    Effect.exit(Effect.andThen(enforceMetricsAuthIfConfigured, service.renderPrometheusMetrics())),
  );
  const durationMs = Duration.toMillis(duration);
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
  return Option.match(Cause.findErrorOption(cause), {
    onNone: () => 500,
    onSome: (error) => mapRouteError(error).status,
  });
}

export const systemMetricsRouter = Layer.mergeAll(
  HttpRouter.add(
    "GET",
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
