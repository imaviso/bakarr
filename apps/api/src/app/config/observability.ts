import { Context, Effect, Layer, Record, Redacted, Schema } from "effect";
import * as EffectConfig from "effect/Config";
import type { ConfigError } from "effect/Config";

import { AppConfig } from "@/app/config/schema.ts";
import { PositiveIntConfigSchema, PositiveIntSchema } from "@/infra/schema.ts";

export class ObservabilityConfigModel extends Schema.Class<ObservabilityConfigModel>(
  "ObservabilityConfigModel",
)({
  deploymentEnvironment: Schema.NullOr(Schema.String),
  grafanaUrl: Schema.NullOr(Schema.String),
  lokiUrl: Schema.NullOr(Schema.String),
  metricsExportIntervalMs: PositiveIntSchema,
  metricsRequireAuth: Schema.Boolean,
  otlpEndpoint: Schema.NullOr(Schema.String),
  otlpHeaders: Schema.RedactedFromValue(Schema.String),
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

export function makeDefaultObservabilityConfig(appVersion: string) {
  return new ObservabilityConfigModel({
    deploymentEnvironment: null,
    grafanaUrl: null,
    lokiUrl: null,
    metricsExportIntervalMs: 60_000,
    metricsRequireAuth: true,
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

const stringField = (key: string, fallback: string) =>
  EffectConfig.schema(Schema.String, key).pipe(EffectConfig.withDefault(fallback));

const nullableStringField = (key: string, fallback: string | null) =>
  EffectConfig.schema(Schema.String, key).pipe(EffectConfig.withDefault(fallback));

const positiveIntField = (key: string, fallback: number) =>
  EffectConfig.schema(PositiveIntConfigSchema, key).pipe(EffectConfig.withDefault(fallback));

const nullableStringOverrides = {
  deploymentEnvironment: "OTEL_DEPLOYMENT_ENVIRONMENT",
  grafanaUrl: "BAKARR_GRAFANA_URL",
  lokiUrl: "BAKARR_LOKI_URL",
  otlpEndpoint: "OTEL_EXPORTER_OTLP_ENDPOINT",
  tempoUrl: "BAKARR_TEMPO_URL",
  victoriaMetricsUrl: "BAKARR_VICTORIAMETRICS_URL",
} satisfies Partial<Record<keyof ObservabilityConfigOverrides, string>>;

const requiredStringOverrides = {
  resourceAttributes: "OTEL_RESOURCE_ATTRIBUTES",
  serviceName: "OTEL_SERVICE_NAME",
  serviceVersion: "OTEL_SERVICE_VERSION",
} satisfies Partial<Record<keyof ObservabilityConfigOverrides, string>>;

const positiveIntOverrides = {
  metricsExportIntervalMs: "OTEL_METRICS_EXPORT_INTERVAL_MS",
  shutdownTimeoutMs: "OTEL_SHUTDOWN_TIMEOUT_MS",
  tracerExportIntervalMs: "OTEL_TRACES_EXPORT_INTERVAL_MS",
} satisfies Partial<Record<keyof ObservabilityConfigOverrides, string>>;

const resolveNullableStringOverrides = Effect.fn(
  "ObservabilityConfig.resolveNullableStringOverrides",
)(function* (
  overrides: ObservabilityConfigOverrides,
  defaults: ObservabilityConfigShape,
): Generator<
  Effect.Effect<string | null, ConfigError>,
  {
    readonly [field in keyof typeof nullableStringOverrides]: string | null;
  }
> {
  const resolved: { [field in keyof typeof nullableStringOverrides]: string | null } = {
    deploymentEnvironment: null,
    grafanaUrl: null,
    lokiUrl: null,
    otlpEndpoint: null,
    tempoUrl: null,
    victoriaMetricsUrl: null,
  };

  for (const field of Record.keys(nullableStringOverrides)) {
    const override = overrides[field];
    resolved[field] =
      override !== undefined
        ? override
        : yield* nullableStringField(nullableStringOverrides[field], defaults[field]);
  }

  return resolved;
});

const resolveRequiredStringOverrides = Effect.fn(
  "ObservabilityConfig.resolveRequiredStringOverrides",
)(function* (
  overrides: ObservabilityConfigOverrides,
  defaults: ObservabilityConfigShape,
): Generator<
  Effect.Effect<string, ConfigError>,
  {
    readonly [field in keyof typeof requiredStringOverrides]: string;
  }
> {
  const resolved: { [field in keyof typeof requiredStringOverrides]: string } = {
    resourceAttributes: "",
    serviceName: "",
    serviceVersion: "",
  };

  for (const field of Record.keys(requiredStringOverrides)) {
    const override = overrides[field];
    resolved[field] =
      override !== undefined
        ? override
        : yield* stringField(requiredStringOverrides[field], defaults[field]);
  }

  return resolved;
});

const resolvePositiveIntOverrides = Effect.fn("ObservabilityConfig.resolvePositiveIntOverrides")(
  function* (
    overrides: ObservabilityConfigOverrides,
    defaults: ObservabilityConfigShape,
  ): Generator<
    Effect.Effect<number, ConfigError>,
    { readonly [field in keyof typeof positiveIntOverrides]: number }
  > {
    const resolved: { [field in keyof typeof positiveIntOverrides]: number } = {
      metricsExportIntervalMs: 0,
      shutdownTimeoutMs: 0,
      tracerExportIntervalMs: 0,
    };

    for (const field of Record.keys(positiveIntOverrides)) {
      const override = overrides[field];
      resolved[field] =
        override ?? (yield* positiveIntField(positiveIntOverrides[field], defaults[field]));
    }

    return resolved;
  },
);

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

        const nullableStrings = yield* resolveNullableStringOverrides(overrides, defaults);
        const requiredStrings = yield* resolveRequiredStringOverrides(overrides, defaults);
        const intervals = yield* resolvePositiveIntOverrides(overrides, defaults);

        const metricsRequireAuth =
          overrides.metricsRequireAuth ??
          (yield* EffectConfig.boolean("BAKARR_METRICS_REQUIRE_AUTH").pipe(
            EffectConfig.withDefault(defaults.metricsRequireAuth),
          ));

        const otlpHeaders =
          overrides.otlpHeaders === undefined
            ? yield* EffectConfig.schema(
                Schema.RedactedFromValue(Schema.String),
                "OTEL_EXPORTER_OTLP_HEADERS",
              ).pipe(EffectConfig.withDefault(defaults.otlpHeaders))
            : Redacted.make(overrides.otlpHeaders);

        return new ObservabilityConfigModel({
          deploymentEnvironment: normalizeNullableString(nullableStrings.deploymentEnvironment),
          grafanaUrl: normalizeNullableString(nullableStrings.grafanaUrl),
          lokiUrl: normalizeNullableString(nullableStrings.lokiUrl),
          metricsExportIntervalMs: intervals.metricsExportIntervalMs,
          metricsRequireAuth,
          otlpEndpoint: normalizeNullableString(nullableStrings.otlpEndpoint),
          otlpHeaders,
          resourceAttributes: requiredStrings.resourceAttributes,
          serviceName: requiredStrings.serviceName,
          serviceVersion: requiredStrings.serviceVersion,
          shutdownTimeoutMs: intervals.shutdownTimeoutMs,
          tempoUrl: normalizeNullableString(nullableStrings.tempoUrl),
          tracerExportIntervalMs: intervals.tracerExportIntervalMs,
          victoriaMetricsUrl: normalizeNullableString(nullableStrings.victoriaMetricsUrl),
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
