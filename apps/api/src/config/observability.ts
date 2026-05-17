import { Config as EffectConfig, Context, Effect, Layer, Redacted, Schema } from "effect";

import { AppConfig } from "@/config/schema.ts";
import { readConfigValue, readNullableConfigValue } from "@/config/read-config-value.ts";
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
  static layer(overrides: ObservabilityConfigOverrides = {}) {
    return Layer.effect(
      ObservabilityConfig,
      Effect.gen(function* () {
        const appConfig = yield* AppConfig;
        const defaults = makeDefaultObservabilityConfig(appConfig.appVersion);
        const otlpEndpoint = yield* readNullableConfigValue(
          overrides.otlpEndpoint,
          Schema.Config("OTEL_EXPORTER_OTLP_ENDPOINT", Schema.String),
          defaults.otlpEndpoint,
        );
        const serviceName = yield* readConfigValue(
          overrides.serviceName,
          Schema.Config("OTEL_SERVICE_NAME", Schema.String).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaults.serviceName)),
          ),
        );
        const serviceVersion = yield* readConfigValue(
          overrides.serviceVersion,
          Schema.Config("OTEL_SERVICE_VERSION", Schema.String).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaults.serviceVersion)),
          ),
        );
        const deploymentEnvironment = yield* readNullableConfigValue(
          overrides.deploymentEnvironment,
          Schema.Config("OTEL_DEPLOYMENT_ENVIRONMENT", Schema.String),
          defaults.deploymentEnvironment,
        );
        const resourceAttributes = yield* readConfigValue(
          overrides.resourceAttributes,
          Schema.Config("OTEL_RESOURCE_ATTRIBUTES", Schema.String).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaults.resourceAttributes)),
          ),
        );
        const grafanaUrl = yield* readNullableConfigValue(
          overrides.grafanaUrl,
          Schema.Config("BAKARR_GRAFANA_URL", Schema.String),
          defaults.grafanaUrl,
        );
        const victoriaMetricsUrl = yield* readNullableConfigValue(
          overrides.victoriaMetricsUrl,
          Schema.Config("BAKARR_VICTORIAMETRICS_URL", Schema.String),
          defaults.victoriaMetricsUrl,
        );
        const tempoUrl = yield* readNullableConfigValue(
          overrides.tempoUrl,
          Schema.Config("BAKARR_TEMPO_URL", Schema.String),
          defaults.tempoUrl,
        );
        const lokiUrl = yield* readNullableConfigValue(
          overrides.lokiUrl,
          Schema.Config("BAKARR_LOKI_URL", Schema.String),
          defaults.lokiUrl,
        );
        const otlpHeaders = yield* readConfigValue(
          overrides.otlpHeaders === undefined ? undefined : Redacted.make(overrides.otlpHeaders),
          Schema.Config("OTEL_EXPORTER_OTLP_HEADERS", Schema.Redacted(Schema.String)).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaults.otlpHeaders)),
          ),
        );
        const metricsExportIntervalMs = yield* readConfigValue(
          overrides.metricsExportIntervalMs,
          Schema.Config("OTEL_METRICS_EXPORT_INTERVAL_MS", PositiveIntConfigSchema).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaults.metricsExportIntervalMs)),
          ),
        );
        const tracerExportIntervalMs = yield* readConfigValue(
          overrides.tracerExportIntervalMs,
          Schema.Config("OTEL_TRACES_EXPORT_INTERVAL_MS", PositiveIntConfigSchema).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaults.tracerExportIntervalMs)),
          ),
        );
        const shutdownTimeoutMs = yield* readConfigValue(
          overrides.shutdownTimeoutMs,
          Schema.Config("OTEL_SHUTDOWN_TIMEOUT_MS", PositiveIntConfigSchema).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaults.shutdownTimeoutMs)),
          ),
        );
        const metricsRequireAuth = yield* readConfigValue(
          overrides.metricsRequireAuth,
          Schema.Config("BAKARR_METRICS_REQUIRE_AUTH", Schema.BooleanFromString).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaults.metricsRequireAuth)),
          ),
        );

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
