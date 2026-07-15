import { Cause, Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-support.ts";
import { SearchBackgroundRssService } from "@/features/operations/background-search/background-search-rss-support.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import type { InfrastructureError, StoredDataError } from "@/features/errors.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { markJobFailureOrFailWithCause } from "@/infra/job-failure-support.ts";
import {
  BackgroundJobRepository,
  type BackgroundJobRepositoryShape,
} from "@/features/system/repository/background-job-repository.ts";

export type BackgroundSearchRssWorkerError = DatabaseError | InfrastructureError | StoredDataError;

export interface BackgroundSearchRssWorkerServiceShape {
  readonly runRssWorker: () => Effect.Effect<void, BackgroundSearchRssWorkerError>;
}

export function makeBackgroundSearchRssWorkerService(input: {
  readonly backgroundJobRepository: BackgroundJobRepositoryShape;
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
      markFailed: input.backgroundJobRepository.markFailed("rss", cause, input.nowIso),
    }).pipe(
      Effect.catchTag("JobFailurePersistenceError", () => Effect.void),
      Effect.zipRight(Effect.failCause(cause)),
    );

  const runRssWorker = Effect.fn("BackgroundSearchRssWorkerService.runRssWorker")(function* () {
    return yield* Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan("job", "rss");
      yield* input.backgroundJobRepository.markStarted("rss", input.nowIso);
      yield* input.eventBus.publish({ type: "RssCheckStarted" });

      const result = yield* input.rssService.runRssCheck();
      yield* Effect.annotateCurrentSpan("totalFeeds", result.totalFeeds);
      yield* Effect.annotateCurrentSpan("newItems", result.newItems);
      yield* input.missingService.triggerSearchMissing();

      yield* input.backgroundJobRepository.markSucceeded(
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
      const backgroundJobRepository = yield* BackgroundJobRepository;
      const eventBus = yield* EventBus;
      const progress = yield* OperationsProgress;
      const rssService = yield* SearchBackgroundRssService;
      const missingService = yield* SearchBackgroundMissingService;

      return makeBackgroundSearchRssWorkerService({
        backgroundJobRepository,
        eventBus,
        missingService,
        nowIso: currentNowIso,
        progress,
        rssService,
      });
    }),
    dependencies: [BackgroundJobRepository.Default],
  },
) {}

export const BackgroundSearchRssWorkerServiceLive = BackgroundSearchRssWorkerService.Default;
