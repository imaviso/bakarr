import type { ObservabilityStatus } from "@bakarr/shared";

import type { ObservabilityConfigShape } from "@/config/observability.ts";

export const METRICS_ENDPOINT = "/api/metrics";

export function makeObservabilityStatus(config: ObservabilityConfigShape): ObservabilityStatus {
  return {
    environment: config.deploymentEnvironment,
    links: {
      grafana: config.grafanaUrl,
      loki: config.lokiUrl,
      tempo: config.tempoUrl,
      victoriametrics: config.victoriaMetricsUrl,
    },
    metrics_endpoint: METRICS_ENDPOINT,
    metrics_require_auth: config.metricsRequireAuth,
    otlp_endpoint: formatSafeEndpoint(config.otlpEndpoint),
    otlp_enabled: config.otlpEndpoint !== null,
    service_name: config.serviceName,
    service_version: config.serviceVersion,
  };
}

export function formatSafeEndpoint(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}
