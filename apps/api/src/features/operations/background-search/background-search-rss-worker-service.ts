import { Cause, Effect } from "effect";

import { AppDrizzleDatabase, type AppDatabase, DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-support.ts";
import { SearchBackgroundRssService } from "@/features/operations/background-search/background-search-rss-support.ts";
import {
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
} from "@/features/operations/shared/job-support.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { markJobFailureOrFailWithCause } from "@/infra/job-failure-support.ts";

export type BackgroundSearchRssWorkerError = DatabaseError | ExternalCallError | OperationsError;

export interface BackgroundSearchRssWorkerServiceShape {
  readonly runRssWorker: () => Effect.Effect<void, BackgroundSearchRssWorkerError>;
}

export function makeBackgroundSearchRssWorkerService(input: {
  readonly db: AppDatabase;
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
    }).pipe(
      Effect.catchTag("JobFailurePersistenceError", () => Effect.void),
      Effect.zipRight(Effect.failCause(cause)),
    );

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

  return { runRssWorker } satisfies BackgroundSearchRssWorkerServiceShape;
}

export class BackgroundSearchRssWorkerService extends Effect.Service<BackgroundSearchRssWorkerService>()(
  "@bakarr/api/BackgroundSearchRssWorkerService",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const eventBus = yield* EventBus;
      const progress = yield* OperationsProgress;
      const rssService = yield* SearchBackgroundRssService;
      const missingService = yield* SearchBackgroundMissingService;

      return makeBackgroundSearchRssWorkerService({
        db,
        eventBus,
        missingService,
        nowIso: currentNowIso,
        progress,
        rssService,
      });
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export const BackgroundSearchRssWorkerServiceLive = BackgroundSearchRssWorkerService.Default;
