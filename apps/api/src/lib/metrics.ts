import { Effect, Metric, MetricBoundaries, Schema } from "effect";

import type { BackgroundWorkerName } from "../background-worker-model.ts";

const histogramBoundaries = MetricBoundaries.fromIterable([
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
]);

export const httpMetrics = {
  requestDuration: Metric.histogram(
    "bakarr_http_request_duration_ms",
    histogramBoundaries,
    "HTTP request duration in milliseconds",
  ).register(),
  requestsTotal: Metric.counter("bakarr_http_requests_total", {
    description: "Total HTTP requests handled by route",
    incremental: true,
  }).register(),
} as const;

export const backgroundMetrics = {
  daemonRunning: Metric.gauge("bakarr_background_worker_daemon_running", {
    description: "Whether a background worker daemon is active",
  }).register(),
  runDuration: Metric.histogram(
    "bakarr_background_worker_run_duration_ms",
    histogramBoundaries,
    "Background worker run duration in milliseconds",
  ).register(),
  runRunning: Metric.gauge("bakarr_background_worker_run_running", {
    description: "Whether a background worker run is currently active",
  }).register(),
  runsTotal: Metric.counter("bakarr_background_worker_runs_total", {
    description: "Total background worker runs by outcome",
    incremental: true,
  }).register(),
} as const;

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

export function renderBakarrPrometheusMetrics(
  snapshot: ReadonlyArray<{
    readonly metricKey: {
      readonly name: string;
      readonly tags: ReadonlyArray<{ readonly key: string; readonly value: string }>;
    };
    readonly metricState: unknown;
  }>,
) {
  const metricLines: string[] = [];
  const seenTypes = new Set<string>();

  for (const pair of [...snapshot]
    .filter((item) => item.metricKey.name.startsWith("bakarr_"))
    .sort(compareMetricPairs)) {
    const metricName = pair.metricKey.name;
    const tags = normalizeTags(pair.metricKey.tags);
    const state = pair.metricState;

    if (isHistogramState(state)) {
      if (!seenTypes.has(metricName)) {
        metricLines.push(`# TYPE ${metricName} histogram`);
        seenTypes.add(metricName);
      }

      for (const [boundary, count] of state.buckets) {
        metricLines.push(
          `${metricName}_bucket${formatLabels([...tags, ["le", formatNumber(boundary)]])} ${count}`,
        );
      }

      metricLines.push(
        `${metricName}_bucket${formatLabels([...tags, ["le", "+Inf"]])} ${state.count}`,
      );
      metricLines.push(`${metricName}_sum${formatLabels(tags)} ${state.sum}`);
      metricLines.push(`${metricName}_count${formatLabels(tags)} ${state.count}`);
      continue;
    }

    if (isGaugeState(state)) {
      if (!seenTypes.has(metricName)) {
        metricLines.push(`# TYPE ${metricName} gauge`);
        seenTypes.add(metricName);
      }
      metricLines.push(`${metricName}${formatLabels(tags)} ${formatNumber(state.value)}`);
      continue;
    }

    if (isCounterState(state)) {
      if (!seenTypes.has(metricName)) {
        metricLines.push(`# TYPE ${metricName} counter`);
        seenTypes.add(metricName);
      }
      metricLines.push(`${metricName}${formatLabels(tags)} ${formatNumber(state.count)}`);
    }
  }

  return metricLines;
}

function withHttpTags<Type, In, Out>(
  metric: Metric.Metric<Type, In, Out>,
  input: {
    readonly method: string;
    readonly route: string;
    readonly status: number;
  },
) {
  return Metric.tagged(
    Metric.tagged(
      Metric.tagged(metric, "method", input.method.toUpperCase()),
      "route",
      input.route,
    ),
    "status",
    String(input.status),
  );
}

function withWorkerTag<Type, In, Out>(
  metric: Metric.Metric<Type, In, Out>,
  worker: BackgroundWorkerName,
) {
  return Metric.tagged(metric, "worker", worker);
}

function withWorkerStatusTags<Type, In, Out>(
  metric: Metric.Metric<Type, In, Out>,
  input: {
    readonly status: "failure" | "skipped" | "success";
    readonly worker: BackgroundWorkerName;
  },
) {
  return Metric.tagged(Metric.tagged(metric, "worker", input.worker), "status", input.status);
}

function compareMetricPairs(
  left: {
    readonly metricKey: {
      readonly name: string;
      readonly tags: ReadonlyArray<{ readonly key: string; readonly value: string }>;
    };
  },
  right: {
    readonly metricKey: {
      readonly name: string;
      readonly tags: ReadonlyArray<{ readonly key: string; readonly value: string }>;
    };
  },
) {
  const nameOrder = left.metricKey.name.localeCompare(right.metricKey.name);

  if (nameOrder !== 0) {
    return nameOrder;
  }

  return JSON.stringify(normalizeTags(left.metricKey.tags)).localeCompare(
    JSON.stringify(normalizeTags(right.metricKey.tags)),
  );
}

function normalizeTags(tags: ReadonlyArray<{ readonly key: string; readonly value: string }>) {
  return [...tags]
    .map((tag) => [tag.key, tag.value] as const)
    .sort(([left], [right]) => left.localeCompare(right));
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
  return typeof value === "bigint"
    ? value.toString()
    : Number.isFinite(value)
      ? String(value)
      : "0";
}

const HistogramStateSchema = Schema.Struct({
  buckets: Schema.Array(Schema.Tuple(Schema.Number, Schema.Number)),
  count: Schema.Number,
  sum: Schema.Number,
});

const GaugeStateSchema = Schema.Struct({
  value: Schema.Union(Schema.Number, Schema.BigInt),
});

const CounterStateSchema = Schema.Struct({
  count: Schema.Union(Schema.Number, Schema.BigInt),
});

const isHistogramState = Schema.is(HistogramStateSchema);
const isGaugeState = Schema.is(GaugeStateSchema);
const isCounterState = Schema.is(CounterStateSchema);
