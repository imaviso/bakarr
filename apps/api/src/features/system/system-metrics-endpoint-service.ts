import { Context, Effect, Layer } from "effect";

import {
  type SystemRuntimeMetricsError,
  SystemRuntimeMetricsService,
} from "@/features/system/system-runtime-metrics-service.ts";

export interface SystemMetricsEndpointServiceShape {
  readonly renderMetricsEndpoint: () => Effect.Effect<string, SystemRuntimeMetricsError>;
}

export class SystemMetricsEndpointService extends Context.Tag(
  "@bakarr/api/SystemMetricsEndpointService",
)<SystemMetricsEndpointService, SystemMetricsEndpointServiceShape>() {}

export const SystemMetricsEndpointServiceLive = Layer.effect(
  SystemMetricsEndpointService,
  Effect.gen(function* () {
    const runtimeMetricsService = yield* SystemRuntimeMetricsService;

    const renderMetricsEndpoint = Effect.fn("SystemMetricsEndpointService.renderMetricsEndpoint")(
      () => runtimeMetricsService.renderPrometheusMetrics(),
    );

    return SystemMetricsEndpointService.of({ renderMetricsEndpoint });
  }),
);
