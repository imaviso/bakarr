import { Cause, Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-support.ts";
import { SearchBackgroundRssService } from "@/features/operations/background-search/background-search-rss-support.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import type { InfrastructureError, StoredDataError } from "@/features/errors.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { markJobFailureOrFailWithCause } from "@/infra/job-failure-support.ts";
import { BackgroundJobRepository } from "@/features/system/repository/background-job-repository.ts";

export type BackgroundSearchRssWorkerError = DatabaseError | InfrastructureError | StoredDataError;

export interface BackgroundSearchRssWorkerServiceShape {
  readonly runRssWorker: () => Effect.Effect<void, BackgroundSearchRssWorkerError>;
}

export class BackgroundSearchRssWorkerService extends Effect.Service<BackgroundSearchRssWorkerService>()(
  "@bakarr/api/BackgroundSearchRssWorkerService",
  {
    // Nested search services still incomplete Defaults — outer ops layer provides them.
    dependencies: [BackgroundJobRepository.Default],
    effect: Effect.gen(function* () {
      const backgroundJobRepository = yield* BackgroundJobRepository;
      const eventBus = yield* EventBus;
      const progress = yield* OperationsProgress;
      const rssService = yield* SearchBackgroundRssService;
      const missingService = yield* SearchBackgroundMissingService;
      const nowIso = currentNowIso;

      const markFailureAndRethrowCause = (cause: Cause.Cause<BackgroundSearchRssWorkerError>) =>
        markJobFailureOrFailWithCause({
          cause,
          job: "rss",
          logAnnotations: { run_failure_cause: Cause.pretty(cause) },
          logMessage: "Failed to record rss job failure",
          markFailed: backgroundJobRepository.markFailed("rss", cause, nowIso),
        }).pipe(
          Effect.catchTag("JobFailurePersistenceError", () => Effect.void),
          Effect.zipRight(Effect.failCause(cause)),
        );

      const runRssWorker = Effect.fn("BackgroundSearchRssWorkerService.runRssWorker")(function* () {
        return yield* Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan("job", "rss");
          yield* backgroundJobRepository.markStarted("rss", nowIso);
          yield* eventBus.publish({ type: "RssCheckStarted" });

          const result = yield* rssService.runRssCheck();
          yield* Effect.annotateCurrentSpan("totalFeeds", result.totalFeeds);
          yield* Effect.annotateCurrentSpan("newItems", result.newItems);
          yield* missingService.triggerSearchMissing();

          yield* backgroundJobRepository.markSucceeded(
            "rss",
            `Queued ${result.newItems} release(s)`,
            nowIso,
          );
          yield* eventBus.publish({
            type: "RssCheckFinished",
            payload: { new_items: result.newItems, total_feeds: result.totalFeeds },
          });
          yield* progress.publishDownloadProgress();
        }).pipe(Effect.catchAllCause(markFailureAndRethrowCause));
      });

      return { runRssWorker } satisfies BackgroundSearchRssWorkerServiceShape;
    }),
  },
) {}

export const BackgroundSearchRssWorkerServiceLive = BackgroundSearchRssWorkerService.Default;
