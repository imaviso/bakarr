import { Otlp } from "@effect/opentelemetry";
import { Duration, Effect, Layer, Redacted } from "effect";

import { ObservabilityConfig } from "@/config/observability.ts";

export const TelemetryLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* ObservabilityConfig;

    if (config.otlpEndpoint === null) {
      return Layer.empty;
    }

    return Otlp.layerJson({
      baseUrl: config.otlpEndpoint,
      headers: parseKeyValueList(Redacted.value(config.otlpHeaders)),
      loggerExcludeLogSpans: true,
      metricsExportInterval: Duration.millis(config.metricsExportIntervalMs),
      resource: {
        attributes: parseResourceAttributes(
          config.resourceAttributes,
          config.deploymentEnvironment,
        ),
        serviceName: config.serviceName,
        serviceVersion: config.serviceVersion,
      },
      shutdownTimeout: Duration.millis(config.shutdownTimeoutMs),
      tracerExportInterval: Duration.millis(config.tracerExportIntervalMs),
    });
  }),
);

export function parseResourceAttributes(
  value: string,
  deploymentEnvironment: string | null,
): Record<string, string> {
  const attributes = parseKeyValueList(value);

  if (deploymentEnvironment !== null && attributes["deployment.environment.name"] === undefined) {
    attributes["deployment.environment.name"] = deploymentEnvironment;
  }

  return attributes;
}

export function parseKeyValueList(value: string): Record<string, string> {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .flatMap((entry) => {
      const separatorIndex = entry.indexOf("=");

      if (separatorIndex <= 0) {
        return [];
      }

      const key = entry.slice(0, separatorIndex).trim();
      const parsedValue = entry.slice(separatorIndex + 1).trim();

      return key.length === 0 ? [] : [[key, parsedValue] as const];
    });

  return Object.fromEntries(entries);
}
