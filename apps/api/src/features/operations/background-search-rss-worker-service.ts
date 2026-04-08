import { Cause, Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search-missing-support.ts";
import { SearchBackgroundRssService } from "@/features/operations/background-search-rss-support.ts";
import {
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
} from "@/features/operations/job-support.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import { OperationsProgress } from "@/features/operations/operations-progress-service.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { markJobFailureOrFailWithCause } from "@/lib/job-failure-support.ts";

export type BackgroundSearchRssWorkerError = DatabaseError | ExternalCallError | OperationsError;

export interface BackgroundSearchRssWorkerServiceShape {
  readonly runRssWorker: () => Effect.Effect<void, BackgroundSearchRssWorkerError>;
}

export class BackgroundSearchRssWorkerService extends Context.Tag(
  "@bakarr/api/BackgroundSearchRssWorkerService",
)<BackgroundSearchRssWorkerService, BackgroundSearchRssWorkerServiceShape>() {}

export function makeBackgroundSearchRssWorkerService(input: {
  readonly db: typeof Database.Service.db;
  readonly eventBus: typeof EventBus.Service;
  readonly missingService: typeof SearchBackgroundMissingService.Service;
  readonly nowIso: () => Effect.Effect<string>;
  readonly progress: typeof OperationsProgress.Service;
  readonly rssService: typeof SearchBackgroundRssService.Service;
}) {
  const markFailureAndRethrowCause = (cause: Cause.Cause<BackgroundSearchRssWorkerError>) =>
    markJobFailureOrFailWithCause({
      cause,
      job: "rss",
      logAnnotations: { run_failure_cause: Cause.pretty(cause) },
      logMessage: "Failed to record rss job failure",
      markFailed: markJobFailed(input.db, "rss", cause, input.nowIso),
    }).pipe(Effect.zipRight(Effect.failCause(cause)));

  const runRssWorker = Effect.fn("BackgroundSearchRssWorkerService.runRssWorker")(function* () {
    return yield* Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan("job", "rss");
      yield* markJobStarted(input.db, "rss", input.nowIso);
      yield* input.eventBus.publish({ type: "RssCheckStarted" });

      const result = yield* input.rssService.runRssCheck();
      yield* Effect.annotateCurrentSpan("totalFeeds", result.totalFeeds);
      yield* Effect.annotateCurrentSpan("newItems", result.newItems);
      yield* input.missingService.triggerSearchMissing();

      yield* markJobSucceeded(
        input.db,
        "rss",
        `Queued ${result.newItems} release(s)`,
        input.nowIso,
      );
      yield* input.eventBus.publish({
        type: "RssCheckFinished",
        payload: { new_items: result.newItems, total_feeds: result.totalFeeds },
      });
      yield* input.progress.publishDownloadProgress();
    }).pipe(Effect.catchAllCause(markFailureAndRethrowCause));
  });

  return BackgroundSearchRssWorkerService.of({ runRssWorker });
}

export const BackgroundSearchRssWorkerServiceLive = Layer.effect(
  BackgroundSearchRssWorkerService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const progress = yield* OperationsProgress;
    const clock = yield* ClockService;
    const rssService = yield* SearchBackgroundRssService;
    const missingService = yield* SearchBackgroundMissingService;

    return makeBackgroundSearchRssWorkerService({
      db,
      eventBus,
      missingService,
      nowIso: () => nowIsoFromClock(clock),
      progress,
      rssService,
    });
  }),
);
