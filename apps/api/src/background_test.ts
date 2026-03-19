import { assertEquals } from "@std/assert";
import { Deferred, Effect, Fiber, Metric } from "effect";

import type { Config } from "../../../packages/shared/src/index.ts";
import { buildBackgroundSchedule } from "./background-schedule.ts";
import {
  makeBackgroundWorkerController,
  makeBackgroundWorkerMonitor,
} from "./background.ts";
import {
  makeCoalescedEffectRunner,
  makeLatestValuePublisher,
} from "./features/operations/service-support.ts";
import { runTestEffect } from "./test/effect-test.ts";

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

Deno.test("build background schedule enables RSS and library loops", () => {
  const schedule = buildBackgroundSchedule(baseConfig);

  assertEquals(schedule.initialDelayMs, 5_000);
  assertEquals(schedule.downloadSyncMs, 15_000);
  assertEquals(schedule.rssCheckMs, 30 * 60 * 1000);
  assertEquals(schedule.libraryScanMs, 12 * 60 * 60 * 1000);
  assertEquals(schedule.metadataRefreshMs, 24 * 60 * 60 * 1000);
});

Deno.test("build background schedule disables loops when config disables them", () => {
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

  assertEquals(schedule.initialDelayMs, 5_000);
  assertEquals(schedule.rssCheckMs, null);
  assertEquals(schedule.libraryScanMs, null);
  assertEquals(schedule.metadataRefreshMs, null);
});

Deno.test("build background schedule prefers valid cron over interval", () => {
  const schedule = buildBackgroundSchedule({
    ...baseConfig,
    scheduler: {
      ...baseConfig.scheduler,
      check_interval_minutes: 30,
      cron_expression: "0 * * * *",
      enabled: true,
    },
  });

  assertEquals(schedule.rssCronExpression, "0 * * * *");
  assertEquals(schedule.rssCheckMs, null);
});

Deno.test("build background schedule ignores invalid cron and keeps interval", () => {
  const schedule = buildBackgroundSchedule({
    ...baseConfig,
    scheduler: {
      ...baseConfig.scheduler,
      check_interval_minutes: 30,
      cron_expression: "not a cron",
      enabled: true,
    },
  });

  assertEquals(schedule.rssCronExpression, null);
  assertEquals(schedule.rssCheckMs, 30 * 60 * 1000);
});

Deno.test("background worker monitor tracks supervision state and counters", async () => {
  const snapshot = await runTestEffect(
    Effect.gen(function* () {
      const monitor = yield* makeBackgroundWorkerMonitor();

      yield* monitor.markDaemonStarted("rss");
      yield* monitor.markRunStarted("rss");
      yield* monitor.markRunFailed("rss", "boom");
      yield* monitor.markRunStarted("rss");
      yield* monitor.markRunSucceeded("rss");
      yield* monitor.markRunSkipped("rss");
      yield* monitor.markDaemonStopped("rss");

      return yield* monitor.snapshot();
    }),
  );

  assertEquals(snapshot.rss.daemonRunning, false);
  assertEquals(snapshot.rss.runRunning, false);
  assertEquals(snapshot.rss.failureCount, 1);
  assertEquals(snapshot.rss.successCount, 1);
  assertEquals(snapshot.rss.skipCount, 1);
  assertEquals(snapshot.rss.lastErrorMessage, "boom");
  assertEquals(typeof snapshot.rss.lastStartedAt, "string");
  assertEquals(typeof snapshot.rss.lastSucceededAt, "string");
  assertEquals(typeof snapshot.rss.lastFailedAt, "string");
});

Deno.test("background worker monitor publishes Effect metrics", async () => {
  const { after, before } = await runTestEffect(
    Effect.gen(function* () {
      const monitor = yield* makeBackgroundWorkerMonitor();
      const before = yield* Metric.snapshot;

      yield* monitor.markDaemonStarted("rss");
      yield* monitor.markRunStarted("rss");
      yield* monitor.markRunSucceeded("rss", 123);
      yield* monitor.markRunSkipped("rss");
      yield* monitor.markRunFailed("rss", "boom", 456);

      const after = yield* Metric.snapshot;

      return { after, before };
    }),
  );

  assertEquals(
    counterDelta(after, before, "bakarr_background_worker_runs_total", {
      status: "success",
      worker: "rss",
    }),
    1,
  );
  assertEquals(
    counterDelta(after, before, "bakarr_background_worker_runs_total", {
      status: "failure",
      worker: "rss",
    }),
    1,
  );
  assertEquals(
    counterDelta(after, before, "bakarr_background_worker_runs_total", {
      status: "skipped",
      worker: "rss",
    }),
    1,
  );
  assertEquals(
    gaugeValue(after, "bakarr_background_worker_daemon_running", {
      worker: "rss",
    }),
    1,
  );
  assertEquals(
    histogramCountDelta(
      after,
      before,
      "bakarr_background_worker_run_duration_ms",
      {
        status: "failure",
        worker: "rss",
      },
    ),
    1,
  );
});

function counterDelta(
  after: ReadonlyArray<
    {
      readonly metricKey: {
        readonly name: string;
        readonly tags: ReadonlyArray<
          { readonly key: string; readonly value: string }
        >;
      };
      readonly metricState: unknown;
    }
  >,
  before: ReadonlyArray<
    {
      readonly metricKey: {
        readonly name: string;
        readonly tags: ReadonlyArray<
          { readonly key: string; readonly value: string }
        >;
      };
      readonly metricState: unknown;
    }
  >,
  name: string,
  labels: Record<string, string>,
) {
  return counterValue(after, name, labels) - counterValue(before, name, labels);
}

function counterValue(
  snapshot: ReadonlyArray<
    {
      readonly metricKey: {
        readonly name: string;
        readonly tags: ReadonlyArray<
          { readonly key: string; readonly value: string }
        >;
      };
      readonly metricState: unknown;
    }
  >,
  name: string,
  labels: Record<string, string>,
) {
  const pair = findMetric(snapshot, name, labels);
  return (pair?.metricState as { readonly count: number } | undefined)?.count ??
    0;
}

function gaugeValue(
  snapshot: ReadonlyArray<
    {
      readonly metricKey: {
        readonly name: string;
        readonly tags: ReadonlyArray<
          { readonly key: string; readonly value: string }
        >;
      };
      readonly metricState: unknown;
    }
  >,
  name: string,
  labels: Record<string, string>,
) {
  const pair = findMetric(snapshot, name, labels);
  return (pair?.metricState as { readonly value: number } | undefined)?.value;
}

function histogramCountDelta(
  after: ReadonlyArray<
    {
      readonly metricKey: {
        readonly name: string;
        readonly tags: ReadonlyArray<
          { readonly key: string; readonly value: string }
        >;
      };
      readonly metricState: unknown;
    }
  >,
  before: ReadonlyArray<
    {
      readonly metricKey: {
        readonly name: string;
        readonly tags: ReadonlyArray<
          { readonly key: string; readonly value: string }
        >;
      };
      readonly metricState: unknown;
    }
  >,
  name: string,
  labels: Record<string, string>,
) {
  return histogramCount(after, name, labels) -
    histogramCount(before, name, labels);
}

function histogramCount(
  snapshot: ReadonlyArray<
    {
      readonly metricKey: {
        readonly name: string;
        readonly tags: ReadonlyArray<
          { readonly key: string; readonly value: string }
        >;
      };
      readonly metricState: unknown;
    }
  >,
  name: string,
  labels: Record<string, string>,
) {
  const pair = findMetric(snapshot, name, labels);
  return (pair?.metricState as { readonly count: number } | undefined)?.count ??
    0;
}

function findMetric(
  snapshot: ReadonlyArray<
    {
      readonly metricKey: {
        readonly name: string;
        readonly tags: ReadonlyArray<
          { readonly key: string; readonly value: string }
        >;
      };
      readonly metricState: unknown;
    }
  >,
  name: string,
  labels: Record<string, string>,
) {
  return snapshot.find((pair) =>
    pair.metricKey.name === name &&
    Object.entries(labels).every(([key, value]) =>
      pair.metricKey.tags.some((tag) => tag.key === key && tag.value === value)
    )
  );
}

Deno.test("BackgroundWorkerController starts workers with config", async () => {
  await runTestEffect(
    Effect.gen(function* () {
      const monitor = yield* makeBackgroundWorkerMonitor();
      const controller = yield* makeBackgroundWorkerController({
        monitor,
        spawnWorkers: () => Effect.succeed({ stop: Effect.void }),
      });

      const started = yield* controller.isStarted();
      assertEquals(started, false);

      yield* controller.start(baseConfig);

      const startedAfter = yield* controller.isStarted();
      assertEquals(startedAfter, true);
    }),
  );
});

Deno.test("BackgroundWorkerController start is idempotent", async () => {
  await runTestEffect(
    Effect.gen(function* () {
      const spawnCalls: Config[] = [];
      const monitor = yield* makeBackgroundWorkerMonitor();
      const controller = yield* makeBackgroundWorkerController({
        monitor,
        spawnWorkers: (config: Config) =>
          Effect.sync(() => {
            spawnCalls.push(config);
            return { stop: Effect.void };
          }),
      });

      yield* controller.start(baseConfig);
      yield* controller.start(baseConfig);
      yield* controller.start(baseConfig);

      assertEquals(spawnCalls.length, 1);
    }),
  );
});

Deno.test("BackgroundWorkerController reload spawns new workers and stops old", async () => {
  await runTestEffect(
    Effect.gen(function* () {
      const stoppedHandles: string[] = [];
      const monitor = yield* makeBackgroundWorkerMonitor();
      const controller = yield* makeBackgroundWorkerController({
        monitor,
        spawnWorkers: () =>
          Effect.succeed({
            stop: Effect.sync(() => {
              stoppedHandles.push("handle");
            }),
          }),
      });

      yield* controller.start(baseConfig);
      assertEquals(stoppedHandles.length, 0);

      yield* controller.reload(baseConfig);
      assertEquals(stoppedHandles.length, 1);

      yield* controller.reload(baseConfig);
      assertEquals(stoppedHandles.length, 2);
    }),
  );
});

Deno.test("BackgroundWorkerController reload stops old workers before spawning new", async () => {
  await runTestEffect(
    Effect.gen(function* () {
      const events: string[] = [];
      let handleId = 0;
      const monitor = yield* makeBackgroundWorkerMonitor();
      const controller = yield* makeBackgroundWorkerController({
        monitor,
        spawnWorkers: () =>
          Effect.sync(() => {
            handleId += 1;
            const id = handleId;
            events.push(`spawn-${id}`);

            return {
              stop: Effect.sync(() => {
                events.push(`stop-${id}`);
              }),
            };
          }),
      });

      yield* controller.start(baseConfig);
      yield* controller.reload(baseConfig);

      assertEquals(events, ["spawn-1", "stop-1", "spawn-2"]);
    }),
  );
});

Deno.test("BackgroundWorkerController stops workers when reload spawn fails", async () => {
  await runTestEffect(
    Effect.gen(function* () {
      const stoppedHandles: number[] = [];
      let spawnCallCount = 0;
      const monitor = yield* makeBackgroundWorkerMonitor();
      const controller = yield* makeBackgroundWorkerController({
        monitor,
        spawnWorkers: () =>
          Effect.sync(() => {
            spawnCallCount++;
            if (spawnCallCount === 2) {
              throw new Error("spawn failed");
            }
            return {
              stop: Effect.sync(() => {
                stoppedHandles.push(spawnCallCount);
              }),
            };
          }),
      });

      yield* controller.start(baseConfig);
      assertEquals(stoppedHandles.length, 0);

      const exitResult = yield* Effect.exit(controller.reload(baseConfig));
      assertEquals(exitResult._tag, "Failure");

      assertEquals(stoppedHandles.length, 1);
      const started = yield* controller.isStarted();
      assertEquals(started, false);
    }),
  );
});

Deno.test("BackgroundWorkerController stop shuts down workers", async () => {
  await runTestEffect(
    Effect.gen(function* () {
      const stoppedHandles: string[] = [];
      const monitor = yield* makeBackgroundWorkerMonitor();
      const controller = yield* makeBackgroundWorkerController({
        monitor,
        spawnWorkers: () =>
          Effect.succeed({
            stop: Effect.sync(() => {
              stoppedHandles.push("handle");
            }),
          }),
      });

      yield* controller.start(baseConfig);
      assertEquals(stoppedHandles.length, 0);

      yield* controller.stop();
      assertEquals(stoppedHandles.length, 1);

      const started = yield* controller.isStarted();
      assertEquals(started, false);
    }),
  );
});

Deno.test("BackgroundWorkerController stop is idempotent", async () => {
  await runTestEffect(
    Effect.gen(function* () {
      const stoppedHandles: string[] = [];
      const monitor = yield* makeBackgroundWorkerMonitor();
      const controller = yield* makeBackgroundWorkerController({
        monitor,
        spawnWorkers: () =>
          Effect.succeed({
            stop: Effect.sync(() => {
              stoppedHandles.push("handle");
            }),
          }),
      });

      yield* controller.start(baseConfig);
      yield* controller.stop();
      yield* controller.stop();
      yield* controller.stop();

      assertEquals(stoppedHandles.length, 1);
    }),
  );
});

Deno.test("BackgroundWorkerController serializes concurrent starts", async () => {
  const firstSpawnEntered = deferred<void>();
  const releaseSpawn = deferred<void>();
  let spawnCallCount = 0;

  const controller = await runTestEffect(
    Effect.gen(function* () {
      const monitor = yield* makeBackgroundWorkerMonitor();

      return yield* makeBackgroundWorkerController({
        monitor,
        spawnWorkers: () =>
          Effect.promise(async () => {
            spawnCallCount += 1;
            firstSpawnEntered.resolve();
            await releaseSpawn.promise;
            return { stop: Effect.void };
          }),
      });
    }),
  );

  const firstStart = runTestEffect(controller.start(baseConfig));
  await firstSpawnEntered.promise;

  const secondStart = runTestEffect(controller.start(baseConfig));

  releaseSpawn.resolve();
  await Promise.all([firstStart, secondStart]);

  assertEquals(spawnCallCount, 1);
});

Deno.test("BackgroundWorkerController serializes concurrent reloads", async () => {
  const firstReloadEntered = deferred<void>();
  const releaseReload = deferred<void>();
  const stoppedHandles: string[] = [];
  let spawnCallCount = 0;

  const controller = await runTestEffect(
    Effect.gen(function* () {
      const monitor = yield* makeBackgroundWorkerMonitor();

      return yield* makeBackgroundWorkerController({
        monitor,
        spawnWorkers: () =>
          Effect.promise(async () => {
            spawnCallCount += 1;
            const handleId = `handle-${spawnCallCount}`;

            if (spawnCallCount === 2) {
              firstReloadEntered.resolve();
            }

            if (spawnCallCount >= 2) {
              await releaseReload.promise;
            }

            return {
              stop: Effect.sync(() => {
                stoppedHandles.push(handleId);
              }),
            };
          }),
      });
    }),
  );

  await runTestEffect(controller.start(baseConfig));

  const firstReload = runTestEffect(controller.reload(baseConfig));
  await firstReloadEntered.promise;

  const secondReload = runTestEffect(controller.reload(baseConfig));

  releaseReload.resolve();
  await Promise.all([firstReload, secondReload]);

  assertEquals(stoppedHandles, ["handle-1", "handle-2"]);
});

Deno.test("coalesced effect runner batches concurrent triggers into one follow-up run", async () => {
  await runTestEffect(
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

      assertEquals(runCount.value, 1);

      yield* Deferred.succeed(releaseFirstRun, void 0);
      yield* Deferred.await(secondRunStarted);

      assertEquals(runCount.value, 2);

      yield* Deferred.succeed(releaseSecondRun, void 0);
      yield* Fiber.await(firstTrigger);
      yield* Fiber.await(secondTrigger);
      yield* Fiber.await(thirdTrigger);

      assertEquals(runCount.value, 2);
    }),
  );
});

Deno.test("latest value publisher keeps only the newest pending update", async () => {
  const published: number[] = [];

  await runTestEffect(
    Effect.gen(function* () {
      const firstPublishStarted = yield* Deferred.make<void>();
      const releaseFirstPublish = yield* Deferred.make<void>();

      const publisher = yield* makeLatestValuePublisher((value: number) =>
        Effect.gen(function* () {
          published.push(value);

          if (value === 1) {
            yield* Deferred.succeed(firstPublishStarted, void 0);
            yield* Deferred.await(releaseFirstPublish);
          }
        })
      );

      yield* publisher.offer(1);
      yield* Deferred.await(firstPublishStarted);

      yield* publisher.offer(2);
      yield* publisher.offer(3);

      yield* Deferred.succeed(releaseFirstPublish, void 0);
      yield* publisher.flush;
    }),
  );

  assertEquals(published, [1, 3]);
});

function deferred<A>() {
  let resolve!: (value: A | PromiseLike<A>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<A>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}
