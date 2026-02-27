# Monitoring (Optional LAN Baseline)

This folder contains a minimal Prometheus setup for local monitoring.

## Files

- `prometheus.yml`: scrape configuration for Bakarr metrics.
- `alerts.yml`: basic alert rules for readiness and error-state conditions.
- `dashboard-panels.md`: suggested baseline Grafana panels and PromQL.

## Run Prometheus locally

```bash
prometheus --config.file=monitoring/prometheus.yml
```

Bakarr metrics endpoint:

- `http://localhost:6789/api/metrics`

Health endpoints:

- `http://localhost:6789/api/system/health/live`
- `http://localhost:6789/api/system/health/ready`
