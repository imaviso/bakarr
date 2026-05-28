import { Config as EffectConfig, Context, Effect, Layer, Redacted, Schema } from "effect";

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

const PositiveIntConfigSchema = Schema.NumberFromString.pipe(Schema.compose(PositiveIntSchema));

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

export class ObservabilityConfig extends Context.Tag("@bakarr/api/ObservabilityConfig")<
  ObservabilityConfig,
  ObservabilityConfigShape
>() {
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
            : yield* Schema.Config("OTEL_EXPORTER_OTLP_ENDPOINT", Schema.String).pipe(
                EffectConfig.withDefault(defaults.otlpEndpoint),
              );
        const serviceName =
          overrides.serviceName ??
          (yield* Schema.Config("OTEL_SERVICE_NAME", Schema.String).pipe(
            EffectConfig.withDefault(defaults.serviceName),
          ));
        const serviceVersion =
          overrides.serviceVersion ??
          (yield* Schema.Config("OTEL_SERVICE_VERSION", Schema.String).pipe(
            EffectConfig.withDefault(defaults.serviceVersion),
          ));
        const deploymentEnvironment =
          overrides.deploymentEnvironment !== undefined
            ? overrides.deploymentEnvironment
            : yield* Schema.Config("OTEL_DEPLOYMENT_ENVIRONMENT", Schema.String).pipe(
                EffectConfig.withDefault(defaults.deploymentEnvironment),
              );
        const resourceAttributes =
          overrides.resourceAttributes ??
          (yield* Schema.Config("OTEL_RESOURCE_ATTRIBUTES", Schema.String).pipe(
            EffectConfig.withDefault(defaults.resourceAttributes),
          ));
        const grafanaUrl =
          overrides.grafanaUrl !== undefined
            ? overrides.grafanaUrl
            : yield* Schema.Config("BAKARR_GRAFANA_URL", Schema.String).pipe(
                EffectConfig.withDefault(defaults.grafanaUrl),
              );
        const victoriaMetricsUrl =
          overrides.victoriaMetricsUrl !== undefined
            ? overrides.victoriaMetricsUrl
            : yield* Schema.Config("BAKARR_VICTORIAMETRICS_URL", Schema.String).pipe(
                EffectConfig.withDefault(defaults.victoriaMetricsUrl),
              );
        const tempoUrl =
          overrides.tempoUrl !== undefined
            ? overrides.tempoUrl
            : yield* Schema.Config("BAKARR_TEMPO_URL", Schema.String).pipe(
                EffectConfig.withDefault(defaults.tempoUrl),
              );
        const lokiUrl =
          overrides.lokiUrl !== undefined
            ? overrides.lokiUrl
            : yield* Schema.Config("BAKARR_LOKI_URL", Schema.String).pipe(
                EffectConfig.withDefault(defaults.lokiUrl),
              );
        const otlpHeaders =
          overrides.otlpHeaders === undefined
            ? yield* Schema.Config(
                "OTEL_EXPORTER_OTLP_HEADERS",
                Schema.Redacted(Schema.String),
              ).pipe(EffectConfig.withDefault(defaults.otlpHeaders))
            : Redacted.make(overrides.otlpHeaders);
        const metricsExportIntervalMs =
          overrides.metricsExportIntervalMs ??
          (yield* Schema.Config("OTEL_METRICS_EXPORT_INTERVAL_MS", PositiveIntConfigSchema).pipe(
            EffectConfig.withDefault(defaults.metricsExportIntervalMs),
          ));
        const tracerExportIntervalMs =
          overrides.tracerExportIntervalMs ??
          (yield* Schema.Config("OTEL_TRACES_EXPORT_INTERVAL_MS", PositiveIntConfigSchema).pipe(
            EffectConfig.withDefault(defaults.tracerExportIntervalMs),
          ));
        const shutdownTimeoutMs =
          overrides.shutdownTimeoutMs ??
          (yield* Schema.Config("OTEL_SHUTDOWN_TIMEOUT_MS", PositiveIntConfigSchema).pipe(
            EffectConfig.withDefault(defaults.shutdownTimeoutMs),
          ));
        const metricsRequireAuth =
          overrides.metricsRequireAuth ??
          (yield* Schema.Config("BAKARR_METRICS_REQUIRE_AUTH", Schema.BooleanFromString).pipe(
            EffectConfig.withDefault(defaults.metricsRequireAuth),
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
