import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";

import { AppConfig } from "@/config/schema.ts";
import { PositiveIntSchema } from "@/domain/domain-schema.ts";

export class ObservabilityConfigModel extends Schema.Class<ObservabilityConfigModel>(
  "ObservabilityConfigModel",
)({
  deploymentEnvironment: Schema.NullOr(Schema.String),
  grafanaUrl: Schema.NullOr(Schema.String),
  lokiUrl: Schema.NullOr(Schema.String),
  metricsExportIntervalMs: PositiveIntSchema,
  metricsRequireAuth: Schema.Boolean,
  otlpEndpoint: Schema.NullOr(Schema.String),
  otlpHeaders: Schema.Redacted(Schema.String),
  resourceAttributes: Schema.String,
  serviceName: Schema.String,
  serviceVersion: Schema.String,
  shutdownTimeoutMs: PositiveIntSchema,
  tempoUrl: Schema.NullOr(Schema.String),
  tracerExportIntervalMs: PositiveIntSchema,
  victoriaMetricsUrl: Schema.NullOr(Schema.String),
}) {}

export type ObservabilityConfigShape = Schema.Schema.Type<typeof ObservabilityConfigModel>;

export interface ObservabilityConfigOverrides {
  readonly deploymentEnvironment?: string | null;
  readonly grafanaUrl?: string | null;
  readonly lokiUrl?: string | null;
  readonly metricsExportIntervalMs?: number;
  readonly metricsRequireAuth?: boolean;
  readonly otlpEndpoint?: string | null;
  readonly otlpHeaders?: string;
  readonly resourceAttributes?: string;
  readonly serviceName?: string;
  readonly serviceVersion?: string;
  readonly shutdownTimeoutMs?: number;
  readonly tempoUrl?: string | null;
  readonly tracerExportIntervalMs?: number;
  readonly victoriaMetricsUrl?: string | null;
}

const PositiveIntConfigSchema = Schema.NumberFromString.pipe(Schema.decodeTo(PositiveIntSchema));

export function makeDefaultObservabilityConfig(appVersion: string) {
  return new ObservabilityConfigModel({
    deploymentEnvironment: null,
    grafanaUrl: null,
    lokiUrl: null,
    metricsExportIntervalMs: 60_000,
    metricsRequireAuth: false,
    otlpEndpoint: null,
    otlpHeaders: Redacted.make(""),
    resourceAttributes: "",
    serviceName: "bakarr-api",
    serviceVersion: appVersion,
    shutdownTimeoutMs: 3_000,
    tempoUrl: null,
    tracerExportIntervalMs: 1_000,
    victoriaMetricsUrl: null,
  });
}

export class ObservabilityConfig extends Context.Service<
  ObservabilityConfig,
  ObservabilityConfigShape
>()("@bakarr/api/ObservabilityConfig") {
  static Live = ObservabilityConfig.layerWithOverrides();

  static layer = ObservabilityConfig.Live;

  static layerWithOverrides(overrides: ObservabilityConfigOverrides = {}) {
    return Layer.effect(
      ObservabilityConfig,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        const defaults = makeDefaultObservabilityConfig(appConfig.appVersion);

        const otlpEndpoint =
          overrides.otlpEndpoint !== undefined
            ? overrides.otlpEndpoint
            : yield* Config.schema(Schema.String, "OTEL_EXPORTER_OTLP_ENDPOINT").pipe(
                Config.withDefault(defaults.otlpEndpoint),
              );
        const serviceName =
          overrides.serviceName ??
          (yield* Config.schema(Schema.String, "OTEL_SERVICE_NAME").pipe(
            Config.withDefault(defaults.serviceName),
          ));
        const serviceVersion =
          overrides.serviceVersion ??
          (yield* Config.schema(Schema.String, "OTEL_SERVICE_VERSION").pipe(
            Config.withDefault(defaults.serviceVersion),
          ));
        const deploymentEnvironment =
          overrides.deploymentEnvironment !== undefined
            ? overrides.deploymentEnvironment
            : yield* Config.schema(Schema.String, "OTEL_DEPLOYMENT_ENVIRONMENT").pipe(
                Config.withDefault(defaults.deploymentEnvironment),
              );
        const resourceAttributes =
          overrides.resourceAttributes ??
          (yield* Config.schema(Schema.String, "OTEL_RESOURCE_ATTRIBUTES").pipe(
            Config.withDefault(defaults.resourceAttributes),
          ));
        const grafanaUrl =
          overrides.grafanaUrl !== undefined
            ? overrides.grafanaUrl
            : yield* Config.schema(Schema.String, "BAKARR_GRAFANA_URL").pipe(
                Config.withDefault(defaults.grafanaUrl),
              );
        const victoriaMetricsUrl =
          overrides.victoriaMetricsUrl !== undefined
            ? overrides.victoriaMetricsUrl
            : yield* Config.schema(Schema.String, "BAKARR_VICTORIAMETRICS_URL").pipe(
                Config.withDefault(defaults.victoriaMetricsUrl),
              );
        const tempoUrl =
          overrides.tempoUrl !== undefined
            ? overrides.tempoUrl
            : yield* Config.schema(Schema.String, "BAKARR_TEMPO_URL").pipe(
                Config.withDefault(defaults.tempoUrl),
              );
        const lokiUrl =
          overrides.lokiUrl !== undefined
            ? overrides.lokiUrl
            : yield* Config.schema(Schema.String, "BAKARR_LOKI_URL").pipe(
                Config.withDefault(defaults.lokiUrl),
              );
        const otlpHeaders =
          overrides.otlpHeaders === undefined
            ? yield* Config.schema(
                Schema.RedactedFromValue(Schema.String),
                "OTEL_EXPORTER_OTLP_HEADERS",
              ).pipe(Config.withDefault(defaults.otlpHeaders))
            : Redacted.make(overrides.otlpHeaders);
        const metricsExportIntervalMs =
          overrides.metricsExportIntervalMs ??
          (yield* Config.schema(PositiveIntConfigSchema, "OTEL_METRICS_EXPORT_INTERVAL_MS").pipe(
            Config.withDefault(defaults.metricsExportIntervalMs),
          ));
        const tracerExportIntervalMs =
          overrides.tracerExportIntervalMs ??
          (yield* Config.schema(PositiveIntConfigSchema, "OTEL_TRACES_EXPORT_INTERVAL_MS").pipe(
            Config.withDefault(defaults.tracerExportIntervalMs),
          ));
        const shutdownTimeoutMs =
          overrides.shutdownTimeoutMs ??
          (yield* Config.schema(PositiveIntConfigSchema, "OTEL_SHUTDOWN_TIMEOUT_MS").pipe(
            Config.withDefault(defaults.shutdownTimeoutMs),
          ));
        const metricsRequireAuth =
          overrides.metricsRequireAuth ??
          (yield* Config.boolean("BAKARR_METRICS_REQUIRE_AUTH").pipe(
            Config.withDefault(defaults.metricsRequireAuth),
          ));

        return new ObservabilityConfigModel({
          deploymentEnvironment: normalizeNullableString(deploymentEnvironment),
          grafanaUrl: normalizeNullableString(grafanaUrl),
          lokiUrl: normalizeNullableString(lokiUrl),
          metricsExportIntervalMs,
          metricsRequireAuth,
          otlpEndpoint: normalizeNullableString(otlpEndpoint),
          otlpHeaders,
          resourceAttributes,
          serviceName,
          serviceVersion,
          shutdownTimeoutMs,
          tempoUrl: normalizeNullableString(tempoUrl),
          tracerExportIntervalMs,
          victoriaMetricsUrl: normalizeNullableString(victoriaMetricsUrl),
        });
      }),
    );
  }
}

function normalizeNullableString(value: string | null) {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
