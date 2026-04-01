import { Effect, Exit, Layer } from "effect";
import { eq } from "drizzle-orm";

import { Database, type DatabaseService } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { EventBus, type EventBusShape } from "@/features/events/event-bus.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search-missing-support.ts";
import {
  BackgroundSearchRssWorkerService,
  BackgroundSearchRssWorkerServiceLive,
} from "@/features/operations/background-search-rss-worker-service.ts";
import { SearchBackgroundRssService } from "@/features/operations/background-search-rss-support.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import {
  OperationsProgress,
  type OperationsProgressShape,
} from "@/features/operations/operations-progress-service.ts";
import { ClockServiceLive } from "@/lib/clock.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { assertEquals, describe, it } from "@/test/vitest.ts";

describe("BackgroundSearchRssWorkerService", () => {
  it.scoped("marks success when RSS and missing search both complete", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const calls: string[] = [];
          const events: string[] = [];
          const runtimeConfig = makeTestConfig("/tmp/rss-worker.sqlite");

          const baseLayer = Layer.mergeAll(
            ClockServiceLive,
            Layer.succeed(Database, {
              client: {} as DatabaseService["client"],
              db,
            }),
            Layer.succeed(EventBus, makeEventBusStub(events)),
            Layer.succeed(OperationsProgress, makeOperationsProgressStub()),
            Layer.succeed(RuntimeConfigSnapshotService, {
              getRuntimeConfig: () => Effect.succeed(runtimeConfig),
              replaceRuntimeConfig: () => Effect.void,
            }),
            Layer.succeed(SearchBackgroundRssService, {
              runRssCheck: () =>
                Effect.sync(() => {
                  calls.push("rss");
                  return { newItems: 3, totalFeeds: 2 } as const;
                }),
            }),
            Layer.succeed(SearchBackgroundMissingService, {
              triggerSearchMissing: () =>
                Effect.sync(() => {
                  calls.push("missing");
                }),
            }),
          );

          const workerLayer = BackgroundSearchRssWorkerServiceLive.pipe(Layer.provide(baseLayer));
          const exit = yield* Effect.exit(
            Effect.flatMap(BackgroundSearchRssWorkerService, (service) =>
              service.runRssWorker(),
            ).pipe(Effect.provide(Layer.mergeAll(baseLayer, workerLayer))),
          );

          assertEquals(Exit.isSuccess(exit), true);
          assertEquals(calls, ["rss", "missing"]);
          assertEquals(events, ["RssCheckStarted", "RssCheckFinished"]);

          const [job] = yield* Effect.promise(() =>
            db
              .select()
              .from(schema.backgroundJobs)
              .where(eq(schema.backgroundJobs.name, "rss"))
              .limit(1),
          );

          assertEquals(job.lastStatus, "success");
          assertEquals(job.isRunning, false);
          assertEquals(job.lastMessage, "Queued 3 release(s)");
        }),
      schema,
    }),
  );

  it.scoped("marks failure when missing search fails after RSS succeeds", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const calls: string[] = [];
          const events: string[] = [];
          const runtimeConfig = makeTestConfig("/tmp/rss-worker.sqlite");

          const baseLayer = Layer.mergeAll(
            ClockServiceLive,
            Layer.succeed(Database, {
              client: {} as DatabaseService["client"],
              db,
            }),
            Layer.succeed(EventBus, makeEventBusStub(events)),
            Layer.succeed(OperationsProgress, makeOperationsProgressStub()),
            Layer.succeed(RuntimeConfigSnapshotService, {
              getRuntimeConfig: () => Effect.succeed(runtimeConfig),
              replaceRuntimeConfig: () => Effect.void,
            }),
            Layer.succeed(SearchBackgroundRssService, {
              runRssCheck: () =>
                Effect.sync(() => {
                  calls.push("rss");
                  return { newItems: 2, totalFeeds: 1 } as const;
                }),
            }),
            Layer.succeed(SearchBackgroundMissingService, {
              triggerSearchMissing: () =>
                Effect.gen(function* () {
                  calls.push("missing");
                  return yield* new OperationsInfrastructureError({
                    message: "missing search failed",
                    cause: new Error("missing search failed"),
                  });
                }),
            }),
          );

          const workerLayer = BackgroundSearchRssWorkerServiceLive.pipe(Layer.provide(baseLayer));
          const exit = yield* Effect.exit(
            Effect.flatMap(BackgroundSearchRssWorkerService, (service) =>
              service.runRssWorker(),
            ).pipe(Effect.provide(Layer.mergeAll(baseLayer, workerLayer))),
          );

          assertEquals(Exit.isFailure(exit), true);
          assertEquals(calls, ["rss", "missing"]);
          assertEquals(events, ["RssCheckStarted"]);

          const [job] = yield* Effect.promise(() =>
            db
              .select()
              .from(schema.backgroundJobs)
              .where(eq(schema.backgroundJobs.name, "rss"))
              .limit(1),
          );

          assertEquals(job.lastStatus, "failed");
          assertEquals(job.isRunning, false);
        }),
      schema,
    }),
  );

  it.scoped("marks failure when RSS fails before missing search runs", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const calls: string[] = [];
          const events: string[] = [];
          const runtimeConfig = makeTestConfig("/tmp/rss-worker.sqlite");

          const baseLayer = Layer.mergeAll(
            ClockServiceLive,
            Layer.succeed(Database, {
              client: {} as DatabaseService["client"],
              db,
            }),
            Layer.succeed(EventBus, makeEventBusStub(events)),
            Layer.succeed(OperationsProgress, makeOperationsProgressStub()),
            Layer.succeed(RuntimeConfigSnapshotService, {
              getRuntimeConfig: () => Effect.succeed(runtimeConfig),
              replaceRuntimeConfig: () => Effect.void,
            }),
            Layer.succeed(SearchBackgroundRssService, {
              runRssCheck: () =>
                Effect.gen(function* () {
                  calls.push("rss");
                  return yield* new OperationsInfrastructureError({
                    message: "rss check failed",
                    cause: new Error("rss check failed"),
                  });
                }),
            }),
            Layer.succeed(SearchBackgroundMissingService, {
              triggerSearchMissing: () =>
                Effect.sync(() => {
                  calls.push("missing");
                }),
            }),
          );

          const workerLayer = BackgroundSearchRssWorkerServiceLive.pipe(Layer.provide(baseLayer));
          const exit = yield* Effect.exit(
            Effect.flatMap(BackgroundSearchRssWorkerService, (service) =>
              service.runRssWorker(),
            ).pipe(Effect.provide(Layer.mergeAll(baseLayer, workerLayer))),
          );

          assertEquals(Exit.isFailure(exit), true);
          assertEquals(calls, ["rss"]);
          assertEquals(events, ["RssCheckStarted"]);

          const [job] = yield* Effect.promise(() =>
            db
              .select()
              .from(schema.backgroundJobs)
              .where(eq(schema.backgroundJobs.name, "rss"))
              .limit(1),
          );

          assertEquals(job.lastStatus, "failed");
          assertEquals(job.isRunning, false);
        }),
      schema,
    }),
  );
});

function makeEventBusStub(events: string[]): EventBusShape {
  return {
    publish: (event) =>
      Effect.sync(() => {
        events.push(event.type);
      }),
    subscribe: () => Effect.die(new Error("event subscriptions are not used in this test")),
  };
}

function makeOperationsProgressStub(): OperationsProgressShape {
  return {
    publishDownloadProgress: () => Effect.void,
    publishLibraryScanProgress: () => Effect.void,
    publishRssCheckProgress: () => Effect.void,
  };
}
