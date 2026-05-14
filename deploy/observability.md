# Observability

Local stack:

```sh
docker compose -f docker-compose.observability.yml up
```

Run API with OTLP enabled:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
OTEL_SERVICE_NAME=bakarr-api \
OTEL_DEPLOYMENT_ENVIRONMENT=local \
bun run dev:api
```

Grafana opens at `http://localhost:3000`. Anonymous admin is enabled for local
development. The stack provisions:

- VictoriaMetrics for metrics at `http://localhost:8428`
- Tempo for traces at `http://localhost:3200`
- Loki for logs at `http://localhost:3100`
- OTel Collector OTLP HTTP at `http://localhost:4318`
- OTel Collector OTLP gRPC at `http://localhost:4317`

The collector also scrapes `http://host.docker.internal:8000/api/metrics`, so
Prometheus-format Bakarr metrics work even when OTLP is disabled.

The local collector assumes `BAKARR_METRICS_REQUIRE_AUTH=false`. If you enable
metrics auth, add auth headers to `deploy/otel-collector/config.yml` or scrape
metrics through another authenticated Adapter.

Config vars:

- `OTEL_EXPORTER_OTLP_ENDPOINT`: enables Effect OTLP export when set
- `OTEL_EXPORTER_OTLP_HEADERS`: optional comma-separated `key=value` list
- `OTEL_SERVICE_NAME`: defaults to `bakarr-api`
- `OTEL_SERVICE_VERSION`: defaults to `BAKARR_APP_VERSION`
- `OTEL_DEPLOYMENT_ENVIRONMENT`: maps to `deployment.environment.name`
- `OTEL_RESOURCE_ATTRIBUTES`: optional comma-separated `key=value` resource attrs
- `OTEL_METRICS_EXPORT_INTERVAL_MS`: defaults to `60000`
- `OTEL_TRACES_EXPORT_INTERVAL_MS`: defaults to `1000`
- `OTEL_SHUTDOWN_TIMEOUT_MS`: defaults to `3000`
- `BAKARR_METRICS_REQUIRE_AUTH`: defaults to `false`; set `true` when scraper auth is required
- `BAKARR_GRAFANA_URL`: optional UI link for Grafana
- `BAKARR_VICTORIAMETRICS_URL`: optional UI link for VictoriaMetrics
- `BAKARR_TEMPO_URL`: optional UI link for Tempo
- `BAKARR_LOKI_URL`: optional UI link for Loki

NixOS module example:

```nix
{
  services.bakarr = {
    enable = true;
    observability = {
      otlpEndpoint = "http://otel-collector.lan:4318";
      deploymentEnvironment = "home";
      resourceAttributes = "host.name=media-server";
      metricsRequireAuth = false;
      grafanaUrl = "http://grafana.lan:3000";
      victoriaMetricsUrl = "http://victoriametrics.lan:8428";
      tempoUrl = "http://tempo.lan:3200";
      lokiUrl = "http://loki.lan:3100";
      otlpHeadersFile = "/run/secrets/bakarr-otel.env";
    };
  };
}
```

`otlpHeadersFile` should contain lines accepted by systemd `EnvironmentFile`, for example:

```sh
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer token
```
