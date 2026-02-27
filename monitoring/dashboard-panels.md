# Suggested Grafana Panels (LAN Baseline)

Use these as a starter dashboard against Prometheus.

## 1) API throughput (requests/sec)

PromQL:

```promql
sum by (method) (rate(http_requests_total{path=~"/api/.*"}[5m]))
```

## 2) API error rate (4xx/5xx)

PromQL:

```promql
sum(rate(http_requests_total{status=~"4..|5.."}[5m]))
```

## 3) P95 request latency

PromQL:

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

## 4) Health/readiness status

- Use a stat panel based on the `up{job="bakarr"}` series.
- Add a secondary panel from probing `/api/system/health/ready` if you run a blackbox exporter.

## 5) qBittorrent and queue visibility

- Add a text panel linking to `/api/system/status` for quick inspection.
- If you later expose dedicated queue metrics, add queue depth and active torrent panels here.
