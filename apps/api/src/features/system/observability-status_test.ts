import { assert, it } from "@effect/vitest";
import { Redacted } from "effect";

import { ObservabilityConfigModel } from "@/config/observability.ts";
import { makeObservabilityStatus } from "@/features/system/observability-status.ts";

it("makeObservabilityStatus exposes safe endpoint origin and public links", () => {
  const status = makeObservabilityStatus(
    new ObservabilityConfigModel({
      deploymentEnvironment: "local",
      grafanaUrl: "http://localhost:3000",
      lokiUrl: null,
      metricsExportIntervalMs: 60_000,
      metricsRequireAuth: true,
      otlpEndpoint: "http://otel.example.test:4318/v1/traces",
      otlpHeaders: Redacted.make("authorization=secret"),
      resourceAttributes: "host.name=nas",
      serviceName: "bakarr-api",
      serviceVersion: "0.1.0",
      shutdownTimeoutMs: 3_000,
      tempoUrl: "http://localhost:3200",
      tracerExportIntervalMs: 1_000,
      victoriaMetricsUrl: "http://localhost:8428",
    }),
  );

  assert.deepStrictEqual(status, {
    environment: "local",
    links: {
      grafana: "http://localhost:3000",
      loki: null,
      tempo: "http://localhost:3200",
      victoriametrics: "http://localhost:8428",
    },
    metrics_endpoint: "/api/metrics",
    metrics_require_auth: true,
    otlp_endpoint: "http://otel.example.test:4318",
    otlp_enabled: true,
    service_name: "bakarr-api",
    service_version: "0.1.0",
  });
});
