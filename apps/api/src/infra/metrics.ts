// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Effect, Metric } from "effect";

import type { BackgroundWorkerName } from "@/background/worker-model.ts";

const histogramBoundaries = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export const httpMetrics = {
  requestDuration: Metric.histogram("bakarr_http_request_duration_ms", {
    boundaries: histogramBoundaries,
    description: "HTTP request duration in milliseconds",
  }),
  requestsTotal: Metric.counter("bakarr_http_requests_total", {
    description: "Total HTTP requests handled by route",
    incremental: true,
  }),
};

export const backgroundMetrics = {
  daemonRunning: Metric.gauge("bakarr_background_worker_daemon_running", {
    description: "Whether a background worker daemon is active",
  }),
  runDuration: Metric.histogram("bakarr_background_worker_run_duration_ms", {
    boundaries: histogramBoundaries,
    description: "Background worker run duration in milliseconds",
  }),
  runRunning: Metric.gauge("bakarr_background_worker_run_running", {
    description: "Whether a background worker run is currently active",
  }),
  runsTotal: Metric.counter("bakarr_background_worker_runs_total", {
    description: "Total background worker runs by outcome",
    incremental: true,
  }),
};

export const recordHttpRequestMetrics = Effect.fn("Metrics.recordHttpRequest")(function* (input: {
  readonly durationMs: number;
  readonly method: string;
  readonly route: string;
  readonly status: number;
}) {
  const taggedCounter = withHttpTags(httpMetrics.requestsTotal, input);
  const taggedDuration = withHttpTags(httpMetrics.requestDuration, input);

  yield* Effect.all(
    [Metric.update(taggedCounter, 1), Metric.update(taggedDuration, input.durationMs)],
    { concurrency: "unbounded", discard: true },
  );
});

export const setBackgroundWorkerDaemonRunning = Effect.fn(
  "Metrics.setBackgroundWorkerDaemonRunning",
)(function* (worker: BackgroundWorkerName, running: boolean) {
  yield* Metric.update(withWorkerTag(backgroundMetrics.daemonRunning, worker), running ? 1 : 0);
});

export const setBackgroundWorkerRunRunning = Effect.fn("Metrics.setBackgroundWorkerRunRunning")(
  function* (worker: BackgroundWorkerName, running: boolean) {
    yield* Metric.update(withWorkerTag(backgroundMetrics.runRunning, worker), running ? 1 : 0);
  },
);

export const recordBackgroundWorkerRun = Effect.fn("Metrics.recordBackgroundWorkerRun")(
  function* (input: {
    readonly durationMs?: number;
    readonly status: "failure" | "skipped" | "success";
    readonly worker: BackgroundWorkerName;
  }) {
    const taggedCounter = withWorkerStatusTags(backgroundMetrics.runsTotal, input);

    yield* Metric.update(taggedCounter, 1);

    if (input.durationMs !== undefined) {
      yield* Metric.update(
        withWorkerStatusTags(backgroundMetrics.runDuration, input),
        input.durationMs,
      );
    }
  },
);

export function preRegisterBackgroundWorkerMetrics(workers: readonly BackgroundWorkerName[]) {
  return Effect.all(
    workers.flatMap((worker) => [
      Metric.update(withWorkerTag(backgroundMetrics.daemonRunning, worker), 0),
      Metric.update(withWorkerTag(backgroundMetrics.runRunning, worker), 0),
      Metric.update(
        withWorkerStatusTags(backgroundMetrics.runsTotal, {
          status: "success",
          worker,
        }),
        0,
      ),
      Metric.update(
        withWorkerStatusTags(backgroundMetrics.runsTotal, {
          status: "failure",
          worker,
        }),
        0,
      ),
      Metric.update(
        withWorkerStatusTags(backgroundMetrics.runsTotal, {
          status: "skipped",
          worker,
        }),
        0,
      ),
    ]),
    { concurrency: "unbounded", discard: true },
  );
}

export function renderBakarrPrometheusMetrics(snapshot: ReadonlyArray<Metric.Metric.Snapshot>) {
  const metricLines: string[] = [];
  const seenTypes = new Set<string>();

  for (const item of sortMetricSnapshots(filterBakarrMetricSnapshots(snapshot))) {
    renderMetricSnapshot(item, metricLines, seenTypes);
  }

  return metricLines;
}

function normalizeSnapshotTags(
  attributes: Metric.Metric.Snapshot["attributes"],
): ReadonlyArray<readonly [string, string]> {
  if (attributes === undefined) {
    return [];
  }

  return Object.entries(attributes)
    .map((entry): readonly [string, string] => [entry[0], entry[1]])
    .toSorted(([left], [right]) => left.localeCompare(right));
}

function filterBakarrMetricSnapshots(snapshot: ReadonlyArray<Metric.Metric.Snapshot>) {
  return snapshot.filter((item) => item.id.startsWith("bakarr_"));
}

function sortMetricSnapshots(snapshot: ReadonlyArray<Metric.Metric.Snapshot>) {
  return [...snapshot].toSorted(compareMetricSnapshots);
}

function renderMetricSnapshot(
  item: Metric.Metric.Snapshot,
  metricLines: string[],
  seenTypes: Set<string>,
) {
  const tags = normalizeSnapshotTags(item.attributes);

  if (item.type === "Histogram") {
    ensureMetricType(metricLines, seenTypes, item.id, "histogram");
    metricLines.push(...renderHistogramMetricLines(item.id, tags, item.state));
    return;
  }

  if (item.type === "Gauge") {
    ensureMetricType(metricLines, seenTypes, item.id, "gauge");
    metricLines.push(`${item.id}${formatLabels(tags)} ${formatNumber(item.state.value)}`);
    return;
  }

  if (item.type === "Counter") {
    ensureMetricType(metricLines, seenTypes, item.id, "counter");
    metricLines.push(`${item.id}${formatLabels(tags)} ${formatNumber(item.state.count)}`);
  }
}

function ensureMetricType(
  metricLines: string[],
  seenTypes: Set<string>,
  metricName: string,
  type: "counter" | "gauge" | "histogram",
) {
  if (seenTypes.has(metricName)) {
    return;
  }

  metricLines.push(`# TYPE ${metricName} ${type}`);
  seenTypes.add(metricName);
}

function renderHistogramMetricLines(
  metricName: string,
  tags: ReadonlyArray<readonly [string, string]>,
  state: {
    readonly buckets: ReadonlyArray<readonly [number, number]>;
    readonly count: number;
    readonly sum: number;
  },
) {
  const lines = state.buckets.map(
    ([boundary, count]) =>
      `${metricName}_bucket${formatLabels([...tags, ["le", formatNumber(boundary)]])} ${count}`,
  );

  lines.push(`${metricName}_bucket${formatLabels([...tags, ["le", "+Inf"]])} ${state.count}`);
  lines.push(`${metricName}_sum${formatLabels(tags)} ${state.sum}`);
  lines.push(`${metricName}_count${formatLabels(tags)} ${state.count}`);

  return lines;
}

function withHttpTags<In, Out>(
  metric: Metric.Metric<In, Out>,
  input: {
    readonly method: string;
    readonly route: string;
    readonly status: number;
  },
) {
  return Metric.withAttributes(metric, {
    method: input.method.toUpperCase(),
    route: input.route,
    status: globalThis.String(input.status),
  });
}

function withWorkerTag<In, Out>(metric: Metric.Metric<In, Out>, worker: BackgroundWorkerName) {
  return Metric.withAttributes(metric, { worker });
}

function withWorkerStatusTags<In, Out>(
  metric: Metric.Metric<In, Out>,
  input: {
    readonly status: "failure" | "skipped" | "success";
    readonly worker: BackgroundWorkerName;
  },
) {
  return Metric.withAttributes(metric, { status: input.status, worker: input.worker });
}

function compareMetricSnapshots(left: Metric.Metric.Snapshot, right: Metric.Metric.Snapshot) {
  const nameOrder = left.id.localeCompare(right.id);

  if (nameOrder !== 0) {
    return nameOrder;
  }

  return JSON.stringify(normalizeSnapshotTags(left.attributes)).localeCompare(
    JSON.stringify(normalizeSnapshotTags(right.attributes)),
  );
}

function formatLabels(tags: ReadonlyArray<readonly [string, string]>) {
  if (tags.length === 0) {
    return "";
  }

  return `{${tags.map(([key, value]) => `${key}="${escapeLabelValue(value)}"`).join(",")}}`;
}

function escapeLabelValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

function formatNumber(value: number | bigint) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (globalThis.Number.isFinite(value)) {
    return globalThis.String(value);
  }

  return "0";
}
