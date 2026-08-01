import { Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-service.ts";
import { SearchBackgroundRssService } from "@/features/operations/background-search/background-search-rss-service.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { InfrastructureError } from "@/features/errors.ts";
import { BackgroundJobRunner } from "@/background/background-job-runner.ts";

/** Job-edge union — non-domain failures collapsed to InfrastructureError. */
export type BackgroundSearchRssWorkerError = DatabaseError | InfrastructureError;

export interface BackgroundSearchRssWorkerServiceShape {
  readonly runRssWorker: () => Effect.Effect<void, BackgroundSearchRssWorkerError>;
}

const mapWorkerError = (error: unknown): BackgroundSearchRssWorkerError =>
  error instanceof DatabaseError
    ? error
    : new InfrastructureError({
        message: "RSS background worker failed",
        cause: error,
      });

export class BackgroundSearchRssWorkerService extends Effect.Service<BackgroundSearchRssWorkerService>()(
  "@bakarr/api/BackgroundSearchRssWorkerService",
  {
    // EventBus + OperationsProgress come from the lifecycle layer.
    dependencies: [
      BackgroundJobRunner.Default,
      SearchBackgroundMissingService.Default,
      SearchBackgroundRssService.Default,
    ],
    effect: Effect.gen(function* () {
      const backgroundJobRunner = yield* BackgroundJobRunner;
      const eventBus = yield* EventBus;
      const progress = yield* OperationsProgress;
      const rssService = yield* SearchBackgroundRssService;
      const missingService = yield* SearchBackgroundMissingService;

      const runRssWorker = Effect.fn("BackgroundSearchRssWorkerService.runRssWorker")(function* () {
        return yield* backgroundJobRunner
          .runJob(
            "rss",
            Effect.gen(function* () {
              yield* Effect.annotateCurrentSpan("job", "rss");
              yield* eventBus.publish({ type: "RssCheckStarted" });

              const result = yield* rssService.runRssCheck().pipe(Effect.mapError(mapWorkerError));
              yield* Effect.annotateCurrentSpan("totalFeeds", result.totalFeeds);
              yield* Effect.annotateCurrentSpan("newItems", result.newItems);
              yield* missingService.triggerSearchMissing().pipe(Effect.mapError(mapWorkerError));

              yield* eventBus.publish({
                type: "RssCheckFinished",
                payload: { new_items: result.newItems, total_feeds: result.totalFeeds },
              });
              yield* progress.publishDownloadProgress().pipe(Effect.mapError(mapWorkerError));

              return result;
            }),
            (result) => `Queued ${result.newItems} release(s)`,
          )
          .pipe(Effect.as(undefined));
      });

      return { runRssWorker } satisfies BackgroundSearchRssWorkerServiceShape;
    }),
  },
) {}

export const BackgroundSearchRssWorkerServiceLive = BackgroundSearchRssWorkerService.Default;
