import { assert, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Logger, Metric, Scope, TestClock } from "effect";
import type { ClockServiceShape } from "@/lib/clock.ts";

import type { Config } from "@packages/shared/index.ts";
import { buildBackgroundSchedule } from "@/background-schedule.ts";
import { makeBackgroundWorkerController } from "@/background-controller-core.ts";
import { makeBackgroundWorkerMonitor } from "@/background-monitor.ts";
import { withLockEffectOrFail } from "@/background-workers.ts";
import {
  makeCoalescedEffectRunner,
  makeLatestValuePublisher,
  makeSkippingSerializedEffectRunner,
} from "@/lib/effect-coalescing.ts";

const baseConfig: Config = {
  downloads: {
    create_anime_folders: true,
    max_size_gb: 8,
    prefer_dual_audio: false,
    preferred_codec: null,
    preferred_groups: [],
    remote_path_mappings: [],
    root_path: "./downloads",
    use_seadex: true,
  },
  general: {
    database_path: "./bakarr.sqlite",
    images_path: "./data/images",
    log_level: "info",
    max_db_connections: 4,
    min_db_connections: 1,
    suppress_connection_errors: true,
    worker_threads: 4,
  },
  library: {
    auto_scan_interval_hours: 12,
    import_mode: "copy",
    library_path: "./library",
    movie_naming_format: "{title}",
    naming_format: "{title}",
    preferred_title: "romaji",
    recycle_cleanup_days: 30,
    recycle_path: "./recycle-bin",
  },
  nyaa: {
    base_url: "https://nyaa.si",
    default_category: "1_2",
    filter_remakes: true,
    min_seeders: 1,
    preferred_resolution: "1080p",
  },
  profiles: [],
  qbittorrent: {
    default_category: "anime",
    enabled: false,
    password: null,
    url: "http://localhost:8080",
    username: "admin",
  },
  scheduler: {
    check_delay_seconds: 5,
    check_interval_minutes: 30,
    cron_expression: null,
    enabled: true,
    max_concurrent_checks: 2,
    metadata_refresh_hours: 24,
  },
};

type MetricSnapshotPair = {
  readonly metricKey: {
    readonly name: string;
    readonly tags: ReadonlyArray<{ readonly key: string; readonly value: string }>;
  };
  readonly metricState: unknown;
};

type MetricSnapshot = ReadonlyArray<MetricSnapshotPair>;

function addTrackedFinalizer<A>(
  target: Array<A>,
  value: A,
): Effect.Effect<void, never, Scope.Scope> {
  return Effect.addFinalizer(() =>
    Effect.sync(() => {
      target.push(value);
    }),
  );
}

function runInScope<A, E>(
  scope: Scope.Scope,
  effect: Effect.Effect<A, E, Scope.Scope>,
): Effect.Effect<A, E> {
  return effect.pipe(Effect.provideService(Scope.Scope, scope));
}

it("build background schedule enables RSS and library loops", () => {
  const schedule = buildBackgroundSchedule(baseConfig);

  assert.deepStrictEqual(schedule.initialDelayMs, 5_000);
  assert.deepStrictEqual(schedule.downloadSyncMs, 15_000);
  assert.deepStrictEqual(schedule.rssCheckMs, 30 * 60 * 1000);
  assert.deepStrictEqual(schedule.libraryScanMs, 12 * 60 * 60 * 1000);
  assert.deepStrictEqual(schedule.metadataRefreshMs, 24 * 60 * 60 * 1000);
});

it("build background schedule disables loops when config disables them", () => {
  const schedule = buildBackgroundSchedule({
    ...baseConfig,
    library: {
      ...baseConfig.library,
      auto_scan_interval_hours: 0,
    },
    scheduler: {
      ...baseConfig.scheduler,
      enabled: false,
    },
  });

  assert.deepStrictEqual(schedule.initialDelayMs, 5_000);
  assert.deepStrictEqual(schedule.rssCheckMs, null);
  assert.deepStrictEqual(schedule.libraryScanMs, null);
  assert.deepStrictEqual(schedule.metadataRefreshMs, null);
});

it("build background schedule prefers valid cron over interval", () => {
  const schedule = buildBackgroundSchedule({
    ...baseConfig,
    scheduler: {
      ...baseConfig.scheduler,
      check_interval_minutes: 30,
      cron_expression: "0 * * * *",
      enabled: true,
    },
  });

  assert.deepStrictEqual(schedule.rssCronExpression, "0 * * * *");
  assert.deepStrictEqual(schedule.rssCheckMs, null);
});

it("build background schedule ignores invalid cron and keeps interval", () => {
  const schedule = buildBackgroundSchedule({
    ...baseConfig,
    scheduler: {
      ...baseConfig.scheduler,
      check_interval_minutes: 30,
      cron_expression: "not a cron",
      enabled: true,
    },
  });

  assert.deepStrictEqual(schedule.rssCronExpression, null);
  assert.deepStrictEqual(schedule.rssCheckMs, 30 * 60 * 1000);
});

const testClock: ClockServiceShape = {
  currentMonotonicMillis: Effect.succeed(0),
  currentTimeMillis: Effect.succeed(1704067200000),
};

it.effect("background worker monitor tracks supervision state and counters", () =>
  Effect.gen(function* () {
    const monitor = yield* makeBackgroundWorkerMonitor(testClock);

    yield* monitor.markDaemonStarted("rss");
    yield* monitor.markRunStarted("rss");
    yield* monitor.markRunFailed("rss", "boom");
    yield* monitor.markRunStarted("rss");
    yield* monitor.markRunSucceeded("rss");
    yield* monitor.markRunSkipped("rss");
    yield* monitor.markDaemonStopped("rss");

    const snapshot = yield* monitor.snapshot();

    assert.deepStrictEqual(snapshot.rss.daemonRunning, false);
    assert.deepStrictEqual(snapshot.rss.runRunning, false);
    assert.deepStrictEqual(snapshot.rss.failureCount, 1);
    assert.deepStrictEqual(snapshot.rss.successCount, 1);
    assert.deepStrictEqual(snapshot.rss.skipCount, 1);
    assert.deepStrictEqual(snapshot.rss.lastErrorMessage, "boom");
    assert.deepStrictEqual(typeof snapshot.rss.lastStartedAt, "string");
    assert.deepStrictEqual(typeof snapshot.rss.lastSucceededAt, "string");
    assert.deepStrictEqual(typeof snapshot.rss.lastFailedAt, "string");
  }),
);

it.effect("background worker monitor publishes Effect metrics", () =>
  Effect.gen(function* () {
    const monitor = yield* makeBackgroundWorkerMonitor(testClock);
    const before = yield* Metric.snapshot;

    yield* monitor.markDaemonStarted("rss");
    yield* monitor.markRunStarted("rss");
    yield* monitor.markRunSucceeded("rss", 123);
    yield* monitor.markRunSkipped("rss");
    yield* monitor.markRunFailed("rss", "boom", 456);

    const after = yield* Metric.snapshot;

    assert.deepStrictEqual(
      counterDelta(after, before, "bakarr_background_worker_runs_total", {
        status: "success",
        worker: "rss",
      }),
      1,
    );
    assert.deepStrictEqual(
      counterDelta(after, before, "bakarr_background_worker_runs_total", {
        status: "failure",
        worker: "rss",
      }),
      1,
    );
    assert.deepStrictEqual(
      counterDelta(after, before, "bakarr_background_worker_runs_total", {
        status: "skipped",
        worker: "rss",
      }),
      1,
    );
    assert.deepStrictEqual(
      gaugeValue(after, "bakarr_background_worker_daemon_running", {
        worker: "rss",
      }),
      1,
    );
    assert.deepStrictEqual(
      histogramCountDelta(after, before, "bakarr_background_worker_run_duration_ms", {
        status: "failure",
        worker: "rss",
      }),
      1,
    );
  }),
);

it.effect("background worker timeouts are tagged and recorded", () =>
  Effect.gen(function* () {
    const monitor = yield* makeBackgroundWorkerMonitor(testClock);
    const messages: string[] = [];
    const logger = Logger.make<unknown, void>(({ message }) => {
      messages.push(String(message));
    });
    const lockedTask = yield* withLockEffectOrFail("rss", Effect.never, monitor, testClock, 1);
    const fiber = yield* Effect.fork(
      lockedTask.pipe(Effect.provide(Logger.replace(Logger.defaultLogger, logger))),
    );

    yield* TestClock.adjust("1 second");
    const exit = yield* Fiber.await(fiber);
    assert.deepStrictEqual(exit._tag, "Failure");

    const snapshot = yield* monitor.snapshot();

    assert.deepStrictEqual(snapshot.rss.failureCount, 1);
    assert.deepStrictEqual(snapshot.rss.lastErrorMessage, "Worker timed out after 1ms");
    assert.deepStrictEqual(snapshot.rss.runRunning, false);
    assert.deepStrictEqual(
      messages.some((message) => message.includes("background worker timed out")),
      true,
    );
  }),
);

it.effect("background worker interruption marks run as interrupted", () =>
  Effect.gen(function* () {
    const monitor = yield* makeBackgroundWorkerMonitor(testClock);
    const lockedTask = yield* withLockEffectOrFail("rss", Effect.never, monitor, testClock, 10_000);

    const fiber = yield* Effect.fork(lockedTask);
    yield* Fiber.interrupt(fiber);

    const snapshot = yield* monitor.snapshot();

    assert.deepStrictEqual(snapshot.rss.runRunning, false);
    assert.deepStrictEqual(snapshot.rss.failureCount, 0);
    assert.deepStrictEqual(snapshot.rss.lastErrorMessage, null);
    assert.deepStrictEqual(snapshot.rss.successCount, 0);
  }),
);

function counterDelta(
  after: MetricSnapshot,
  before: MetricSnapshot,
  name: string,
  labels: Record<string, string>,
) {
  return counterValue(after, name, labels) - counterValue(before, name, labels);
}

function counterValue(snapshot: MetricSnapshot, name: string, labels: Record<string, string>) {
  const pair = findMetric(snapshot, name, labels);
  return (pair?.metricState as { readonly count: number } | undefined)?.count ?? 0;
}

function gaugeValue(snapshot: MetricSnapshot, name: string, labels: Record<string, string>) {
  const pair = findMetric(snapshot, name, labels);
  return (pair?.metricState as { readonly value: number } | undefined)?.value;
}

function histogramCountDelta(
  after: MetricSnapshot,
  before: MetricSnapshot,
  name: string,
  labels: Record<string, string>,
) {
  return histogramCount(after, name, labels) - histogramCount(before, name, labels);
}

function histogramCount(snapshot: MetricSnapshot, name: string, labels: Record<string, string>) {
  const pair = findMetric(snapshot, name, labels);
  return (pair?.metricState as { readonly count: number } | undefined)?.count ?? 0;
}

function findMetric(snapshot: MetricSnapshot, name: string, labels: Record<string, string>) {
  return snapshot.find(
    (pair) =>
      pair.metricKey.name === name &&
      Object.entries(labels).every(([key, value]) =>
        pair.metricKey.tags.some((tag) => tag.key === key && tag.value === value),
      ),
  );
}

it.effect("BackgroundWorkerController starts workers with config", () =>
  Effect.gen(function* () {
    const controller = yield* makeBackgroundWorkerController({
      spawnWorkers: (_scope, _config) => Effect.void,
    });

    const started = yield* controller.isStarted();
    assert.deepStrictEqual(started, false);

    yield* controller.start(baseConfig);

    const startedAfter = yield* controller.isStarted();
    assert.deepStrictEqual(startedAfter, true);
  }),
);

it.effect("BackgroundWorkerController start is idempotent", () =>
  Effect.gen(function* () {
    const spawnCalls: Config[] = [];
    const controller = yield* makeBackgroundWorkerController({
      spawnWorkers: (_scope, config: Config) =>
        Effect.sync(() => {
          spawnCalls.push(config);
        }),
    });

    yield* controller.start(baseConfig);
    yield* controller.start(baseConfig);
    yield* controller.start(baseConfig);

    assert.deepStrictEqual(spawnCalls.length, 1);
  }),
);

it.effect("BackgroundWorkerController reload spawns new workers and stops old", () =>
  Effect.gen(function* () {
    const stoppedHandles: string[] = [];
    const controller = yield* makeBackgroundWorkerController({
      spawnWorkers: (scope) => runInScope(scope, addTrackedFinalizer(stoppedHandles, "handle")),
    });

    yield* controller.start(baseConfig);
    assert.deepStrictEqual(stoppedHandles.length, 0);

    yield* controller.reload(baseConfig);
    assert.deepStrictEqual(stoppedHandles.length, 1);

    yield* controller.reload(baseConfig);
    assert.deepStrictEqual(stoppedHandles.length, 2);
  }),
);

it.effect("BackgroundWorkerController reload swaps workers after the new scope starts", () =>
  Effect.gen(function* () {
    const events: string[] = [];
    let handleId = 0;
    const controller = yield* makeBackgroundWorkerController({
      spawnWorkers: (scope) =>
        Effect.gen(function* () {
          handleId += 1;
          const id = handleId;
          events.push(`spawn-${id}`);

          yield* runInScope(scope, addTrackedFinalizer(events, `stop-${id}`));
        }),
    });

    yield* controller.start(baseConfig);
    yield* controller.reload(baseConfig);

    assert.deepStrictEqual(events, ["spawn-1", "spawn-2", "stop-1"]);
  }),
);

it.effect("BackgroundWorkerController keeps existing workers when reload spawn fails", () =>
  Effect.gen(function* () {
    const stoppedHandles: number[] = [];
    let spawnCallCount = 0;
    const controller = yield* makeBackgroundWorkerController({
      spawnWorkers: (scope) =>
        Effect.gen(function* () {
          spawnCallCount++;
          if (spawnCallCount === 2) {
            return yield* Effect.die(new Error("spawn failed"));
          }
          yield* runInScope(scope, addTrackedFinalizer(stoppedHandles, spawnCallCount));
        }),
    });

    yield* controller.start(baseConfig);
    assert.deepStrictEqual(stoppedHandles.length, 0);

    const exitResult = yield* Effect.exit(controller.reload(baseConfig));
    assert.deepStrictEqual(exitResult._tag, "Failure");

    assert.deepStrictEqual(stoppedHandles.length, 0);
    const started = yield* controller.isStarted();
    assert.deepStrictEqual(started, true);
  }),
);

it.effect("BackgroundWorkerController stop shuts down workers", () =>
  Effect.gen(function* () {
    const stoppedHandles: string[] = [];
    const controller = yield* makeBackgroundWorkerController({
      spawnWorkers: (scope) => runInScope(scope, addTrackedFinalizer(stoppedHandles, "handle")),
    });

    yield* controller.start(baseConfig);
    assert.deepStrictEqual(stoppedHandles.length, 0);

    yield* controller.stop();
    assert.deepStrictEqual(stoppedHandles.length, 1);

    const started = yield* controller.isStarted();
    assert.deepStrictEqual(started, false);
  }),
);

it.effect("BackgroundWorkerController stop is idempotent", () =>
  Effect.gen(function* () {
    const stoppedHandles: string[] = [];
    const controller = yield* makeBackgroundWorkerController({
      spawnWorkers: (scope) => runInScope(scope, addTrackedFinalizer(stoppedHandles, "handle")),
    });

    yield* controller.start(baseConfig);
    yield* controller.stop();
    yield* controller.stop();
    yield* controller.stop();

    assert.deepStrictEqual(stoppedHandles.length, 1);
  }),
);

it.effect("BackgroundWorkerController serializes concurrent starts", () =>
  Effect.gen(function* () {
    const firstSpawnEntered = yield* Deferred.make<void>();
    const releaseSpawn = yield* Deferred.make<void>();
    let spawnCallCount = 0;

    const controller = yield* makeBackgroundWorkerController({
      spawnWorkers: (_scope) =>
        Effect.gen(function* () {
          spawnCallCount += 1;
          yield* Deferred.succeed(firstSpawnEntered, void 0);
          yield* Deferred.await(releaseSpawn);
        }),
    });

    const firstStart = yield* Effect.fork(controller.start(baseConfig));
    yield* Deferred.await(firstSpawnEntered);

    const secondStart = yield* Effect.fork(controller.start(baseConfig));

    yield* Deferred.succeed(releaseSpawn, void 0);
    yield* Fiber.join(firstStart);
    yield* Fiber.join(secondStart);

    assert.deepStrictEqual(spawnCallCount, 1);
  }),
);

it.effect("BackgroundWorkerController serializes concurrent reloads", () =>
  Effect.gen(function* () {
    const firstReloadEntered = yield* Deferred.make<void>();
    const releaseReload = yield* Deferred.make<void>();
    const stoppedHandles: string[] = [];
    let spawnCallCount = 0;

    const controller = yield* makeBackgroundWorkerController({
      spawnWorkers: (scope) =>
        Effect.gen(function* () {
          spawnCallCount += 1;
          const handleId = `handle-${spawnCallCount}`;

          if (spawnCallCount === 2) {
            yield* Deferred.succeed(firstReloadEntered, void 0);
          }

          if (spawnCallCount >= 2) {
            yield* Deferred.await(releaseReload);
          }

          yield* runInScope(scope, addTrackedFinalizer(stoppedHandles, handleId));
        }),
    });

    yield* controller.start(baseConfig);

    const firstReload = yield* Effect.fork(controller.reload(baseConfig));
    yield* Deferred.await(firstReloadEntered);

    const secondReload = yield* Effect.fork(controller.reload(baseConfig));

    yield* Deferred.succeed(releaseReload, void 0);
    yield* Fiber.join(firstReload);
    yield* Fiber.join(secondReload);

    assert.deepStrictEqual(stoppedHandles, ["handle-1", "handle-2"]);
  }),
);

it.scoped("coalesced effect runner batches concurrent triggers into one follow-up run", () =>
  Effect.gen(function* () {
    const firstRunStarted = yield* Deferred.make<void>();
    const secondRunStarted = yield* Deferred.make<void>();
    const releaseFirstRun = yield* Deferred.make<void>();
    const releaseSecondRun = yield* Deferred.make<void>();
    const runCount = yield* Effect.sync(() => ({ value: 0 }));

    const runner = yield* makeCoalescedEffectRunner(
      Effect.gen(function* () {
        runCount.value += 1;

        if (runCount.value === 1) {
          yield* Deferred.succeed(firstRunStarted, void 0);
          yield* Deferred.await(releaseFirstRun);
          return;
        }

        yield* Deferred.succeed(secondRunStarted, void 0);
        yield* Deferred.await(releaseSecondRun);
      }),
    );

    const firstTrigger = yield* Effect.fork(runner.trigger);
    yield* Deferred.await(firstRunStarted);

    const secondTrigger = yield* Effect.fork(runner.trigger);
    const thirdTrigger = yield* Effect.fork(runner.trigger);

    assert.deepStrictEqual(runCount.value, 1);

    yield* Deferred.succeed(releaseFirstRun, void 0);
    yield* Deferred.await(secondRunStarted);

    assert.deepStrictEqual(runCount.value, 2);

    yield* Deferred.succeed(releaseSecondRun, void 0);
    yield* Fiber.await(firstTrigger);
    yield* Fiber.await(secondTrigger);
    yield* Fiber.await(thirdTrigger);

    assert.deepStrictEqual(runCount.value, 2);
  }),
);

it.scoped("latest value publisher keeps only the newest pending update", () =>
  Effect.gen(function* () {
    const published: number[] = [];
    const firstPublishStarted = yield* Deferred.make<void>();
    const releaseFirstPublish = yield* Deferred.make<void>();

    const publisher = yield* makeLatestValuePublisher((value: number) =>
      Effect.gen(function* () {
        published.push(value);

        if (value === 1) {
          yield* Deferred.succeed(firstPublishStarted, void 0);
          yield* Deferred.await(releaseFirstPublish);
        }
      }),
    );

    yield* publisher.offer(1);
    yield* Deferred.await(firstPublishStarted);

    yield* publisher.offer(2);
    yield* publisher.offer(3);

    yield* Deferred.succeed(releaseFirstPublish, void 0);
    yield* publisher.flush;

    assert.deepStrictEqual(published, [1, 3]);
  }),
);

it.effect("skipping serialized runner drops overlapping trigger attempts", () =>
  Effect.gen(function* () {
    const firstRunStarted = yield* Deferred.make<void>();
    const releaseFirstRun = yield* Deferred.make<void>();
    const runCount = yield* Effect.sync(() => ({ value: 0 }));

    const runner = yield* makeSkippingSerializedEffectRunner(
      Effect.gen(function* () {
        runCount.value += 1;
        yield* Deferred.succeed(firstRunStarted, void 0);
        yield* Deferred.await(releaseFirstRun);
        return runCount.value;
      }),
    );

    const firstTrigger = yield* Effect.fork(runner.trigger);
    yield* Deferred.await(firstRunStarted);

    const secondResult = yield* runner.trigger;
    assert.deepStrictEqual(secondResult._tag, "None");
    assert.deepStrictEqual(runCount.value, 1);

    yield* Deferred.succeed(releaseFirstRun, void 0);

    const firstResult = yield* Fiber.join(firstTrigger);
    assert.deepStrictEqual(firstResult._tag, "Some");
    if (firstResult._tag === "Some") {
      assert.deepStrictEqual(firstResult.value, 1);
    }
  }),
);
