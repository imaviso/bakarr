import { Cause, Effect, Exit, Layer, Stream } from "effect";
import { eq } from "drizzle-orm";

import type { AppDatabase } from "@/db/database.ts";
import * as schema from "@/db/schema.ts";
import { EventBus, type EventBusShape } from "@/features/events/event-bus.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-service.ts";
import { BackgroundSearchRssWorkerService } from "@/features/operations/background-search/background-search-rss-worker-service.ts";
import { SearchBackgroundRssService } from "@/features/operations/background-search/background-search-rss-service.ts";
import { InfrastructureError } from "@/features/errors.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import {
  BackgroundJobRepository,
  makeBackgroundJobRepository,
} from "@/features/system/repository/background-job-repository.ts";
import { assert, describe, it } from "@effect/vitest";

describe("BackgroundSearchRssWorkerService", () => {
  it.scoped("marks success when RSS and missing search both complete", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const calls: string[] = [];
          const result = yield* runWorkerScenario({
            calls,
            db,
            missingService: SearchBackgroundMissingService.make({
              triggerSearchMissing: () =>
                Effect.sync(() => {
                  calls.push("missing");
                }),
            }),
            rssService: SearchBackgroundRssService.make({
              runRssCheck: () =>
                Effect.sync(() => {
                  calls.push("rss");
                  return { newItems: 3, totalFeeds: 2 } as const;
                }),
            }),
          });

          const [job] = yield* tryDatabasePromise(
            "Failed to query backgroundJobs for RSS assertion",
            () =>
              db
                .select()
                .from(schema.backgroundJobs)
                .where(eq(schema.backgroundJobs.name, "rss"))
                .limit(1),
          );
          assert.deepStrictEqual(job !== undefined, true);
          if (!job) {
            return;
          }

          assert.deepStrictEqual(Exit.isSuccess(result.exit), true);
          assert.deepStrictEqual(result.calls, ["rss", "missing"]);
          assert.deepStrictEqual(result.events, ["RssCheckStarted", "RssCheckFinished"]);

          assert.deepStrictEqual(job.lastStatus, "success");
          assert.deepStrictEqual(job.isRunning, false);
          assert.deepStrictEqual(job.lastMessage, "Queued 3 release(s)");
        }),
      schema,
    }),
  );

  it.scoped("marks failure when missing search fails after RSS succeeds", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const calls: string[] = [];
          const result = yield* runWorkerScenario({
            calls,
            db,
            missingService: SearchBackgroundMissingService.make({
              triggerSearchMissing: () =>
                Effect.gen(function* () {
                  calls.push("missing");
                  return yield* new InfrastructureError({
                    message: "missing search failed",
                    cause: new Error("missing search failed"),
                  });
                }),
            }),
            rssService: SearchBackgroundRssService.make({
              runRssCheck: () =>
                Effect.sync(() => {
                  calls.push("rss");
                  return { newItems: 2, totalFeeds: 1 } as const;
                }),
            }),
          });

          assert.deepStrictEqual(Exit.isFailure(result.exit), true);
          assert.deepStrictEqual(result.calls, ["rss", "missing"]);
          assert.deepStrictEqual(result.events, ["RssCheckStarted"]);
          if (Exit.isFailure(result.exit)) {
            const failure = Cause.failureOption(result.exit.cause);
            assert.deepStrictEqual(failure._tag, "Some");
            if (failure._tag === "Some") {
              assert.deepStrictEqual(failure.value._tag, "InfrastructureError");
            }
          }

          const [job] = yield* tryDatabasePromise(
            "Failed to query backgroundJobs for RSS assertion",
            () =>
              db
                .select()
                .from(schema.backgroundJobs)
                .where(eq(schema.backgroundJobs.name, "rss"))
                .limit(1),
          );
          assert.deepStrictEqual(job !== undefined, true);
          if (!job) {
            return;
          }

          assert.deepStrictEqual(job.lastStatus, "failed");
          assert.deepStrictEqual(job.isRunning, false);
        }),
      schema,
    }),
  );

  it.scoped("marks failure when RSS fails before missing search runs", () =>
    withSqliteTestDbEffect({
      run: (db) =>
        Effect.gen(function* () {
          const calls: string[] = [];
          const result = yield* runWorkerScenario({
            calls,
            db,
            missingService: SearchBackgroundMissingService.make({
              triggerSearchMissing: () =>
                Effect.sync(() => {
                  calls.push("missing");
                }),
            }),
            rssService: SearchBackgroundRssService.make({
              runRssCheck: () =>
                Effect.gen(function* () {
                  calls.push("rss");
                  return yield* new InfrastructureError({
                    message: "rss check failed",
                    cause: new Error("rss check failed"),
                  });
                }),
            }),
          });

          assert.deepStrictEqual(Exit.isFailure(result.exit), true);
          assert.deepStrictEqual(result.calls, ["rss"]);
          assert.deepStrictEqual(result.events, ["RssCheckStarted"]);
          if (Exit.isFailure(result.exit)) {
            const failure = Cause.failureOption(result.exit.cause);
            assert.deepStrictEqual(failure._tag, "Some");
            if (failure._tag === "Some") {
              assert.deepStrictEqual(failure.value._tag, "InfrastructureError");
            }
          }

          const [job] = yield* tryDatabasePromise(
            "Failed to query backgroundJobs for RSS assertion",
            () =>
              db
                .select()
                .from(schema.backgroundJobs)
                .where(eq(schema.backgroundJobs.name, "rss"))
                .limit(1),
          );
          assert.deepStrictEqual(job !== undefined, true);
          if (!job) {
            return;
          }

          assert.deepStrictEqual(job.lastStatus, "failed");
          assert.deepStrictEqual(job.isRunning, false);
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
    publishInfo: (message) =>
      Effect.sync(() => {
        events.push(`Info:${message}`);
      }),
    withSubscriptionStream: () =>
      Stream.die(new Error("event subscriptions are not used in this test")),
  };
}

function makeOperationsProgressStub() {
  return OperationsProgress.make({
    getDownloadProgress: () => Effect.succeed([]),
    getDownloadProgressBootstrap: () => Effect.succeed([]),
    getDownloadRuntimeSummary: () => Effect.succeed({ active_count: 0 }),
    publishDownloadProgress: () => Effect.void,
    publishLibraryScanProgress: () => Effect.void,
    publishRssCheckProgress: () => Effect.void,
  });
}

function makeWorkerTestLayer(input: {
  readonly events: string[];
  readonly missingService: typeof SearchBackgroundMissingService.Service;
  readonly rssService: typeof SearchBackgroundRssService.Service;
}) {
  return {
    eventBus: EventBus.make(makeEventBusStub(input.events)),
    missingService: input.missingService,
    progress: makeOperationsProgressStub(),
    rssService: input.rssService,
  };
}

const runWorkerScenario = Effect.fn("BackgroundSearchRssWorkerServiceTest.runWorkerScenario")(
  function* (input: {
    readonly calls: string[];
    readonly db: AppDatabase;
    readonly missingService: typeof SearchBackgroundMissingService.Service;
    readonly rssService: typeof SearchBackgroundRssService.Service;
  }) {
    const events: string[] = [];
    const deps = makeWorkerTestLayer({
      events,
      missingService: input.missingService,
      rssService: input.rssService,
    });
    const layer = BackgroundSearchRssWorkerService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(BackgroundJobRepository, makeBackgroundJobRepository(input.db)),
          Layer.succeed(EventBus, deps.eventBus),
          Layer.succeed(OperationsProgress, deps.progress),
          Layer.succeed(SearchBackgroundMissingService, deps.missingService),
          Layer.succeed(SearchBackgroundRssService, deps.rssService),
        ),
      ),
    );
    const exit = yield* Effect.exit(
      Effect.gen(function* () {
        const worker = yield* BackgroundSearchRssWorkerService;
        yield* worker.runRssWorker();
      }).pipe(Effect.provide(layer)),
    );

    return {
      calls: input.calls,
      events,
      exit,
    } as const;
  },
);
