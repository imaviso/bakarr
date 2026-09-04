import { Duration, Effect, Layer, Record, Redacted } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Otlp from "effect/unstable/observability/Otlp";

import { ObservabilityConfig } from "@/app/config/observability.ts";

export const TelemetryLayer = Layer.unwrap(
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
    }).pipe(Layer.provide(FetchHttpClient.layer));
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
    .flatMap((entry): readonly (readonly [string, string])[] => {
      const separatorIndex = entry.indexOf("=");

      if (separatorIndex <= 0) {
        return [];
      }

      const key = entry.slice(0, separatorIndex).trim();
      const parsedValue = entry.slice(separatorIndex + 1).trim();

      return key.length === 0 ? [] : [[key, parsedValue]];
    });

  return Object.fromEntries(entries);
}
