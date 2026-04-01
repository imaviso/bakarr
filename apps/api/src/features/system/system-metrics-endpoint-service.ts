import { Context, Effect, Layer } from "effect";

import { MetricsService } from "@/features/system/metrics-service.ts";
import { ClockService } from "@/lib/clock.ts";
import { recordHttpRequestMetrics } from "@/lib/metrics.ts";

export interface SystemMetricsEndpointResult {
  readonly body: string;
}

export interface SystemMetricsEndpointServiceShape {
  readonly renderMetricsEndpoint: () => Effect.Effect<
    SystemMetricsEndpointResult,
    import("@/features/system/metrics-service.ts").MetricsServiceError
  >;
}

export class SystemMetricsEndpointService extends Context.Tag(
  "@bakarr/api/SystemMetricsEndpointService",
)<SystemMetricsEndpointService, SystemMetricsEndpointServiceShape>() {}

export const SystemMetricsEndpointServiceLive = Layer.effect(
  SystemMetricsEndpointService,
  Effect.gen(function* () {
    const clock = yield* ClockService;
    const metricsService = yield* MetricsService;

    const renderMetricsEndpoint = Effect.fn("SystemMetricsEndpointService.renderMetricsEndpoint")(
      function* () {
        const startedAt = yield* clock.currentMonotonicMillis;

        const exit = yield* Effect.exit(metricsService.renderPrometheusMetrics());
        const finishedAt = yield* clock.currentMonotonicMillis;
        const durationMs = finishedAt - startedAt;

        if (exit._tag === "Success") {
          yield* recordHttpRequestMetrics({
            durationMs,
            method: "GET",
            route: "/api/metrics",
            status: 200,
          });

          return { body: exit.value } satisfies SystemMetricsEndpointResult;
        }

        yield* recordHttpRequestMetrics({
          durationMs,
          method: "GET",
          route: "/api/metrics",
          status: 500,
        });

        return yield* Effect.failCause(exit.cause);
      },
    );

    return SystemMetricsEndpointService.of({ renderMetricsEndpoint });
  }),
);
