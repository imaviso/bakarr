import { Context, Effect, Layer } from "effect";

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

export type BackgroundSearchRssWorkerError = DatabaseError | ExternalCallError | OperationsError;

export interface BackgroundSearchRssWorkerServiceShape {
  readonly runRssWorker: () => Effect.Effect<void, BackgroundSearchRssWorkerError>;
}

export class BackgroundSearchRssWorkerService extends Context.Tag(
  "@bakarr/api/BackgroundSearchRssWorkerService",
)<BackgroundSearchRssWorkerService, BackgroundSearchRssWorkerServiceShape>() {}

export const BackgroundSearchRssWorkerServiceLive = Layer.effect(
  BackgroundSearchRssWorkerService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const progress = yield* OperationsProgress;
    const clock = yield* ClockService;
    const rssService = yield* SearchBackgroundRssService;
    const missingService = yield* SearchBackgroundMissingService;
    const nowIso = () => nowIsoFromClock(clock);

    const runRssWorker = Effect.fn("BackgroundSearchRssWorkerService.runRssWorker")(function* () {
      return yield* Effect.gen(function* () {
        yield* markJobStarted(db, "rss", nowIso);
        yield* eventBus.publish({ type: "RssCheckStarted" });

        const result = yield* rssService.runRssCheck();
        yield* missingService.triggerSearchMissing();

        yield* markJobSucceeded(db, "rss", `Queued ${result.newItems} release(s)`, nowIso);
        yield* eventBus.publish({
          type: "RssCheckFinished",
          payload: { new_items: result.newItems, total_feeds: result.totalFeeds },
        });
        yield* progress.publishDownloadProgress();
      }).pipe(
        Effect.catchAllCause((cause) =>
          markJobFailed(db, "rss", cause, nowIso).pipe(Effect.zipRight(Effect.failCause(cause))),
        ),
      );
    });

    return BackgroundSearchRssWorkerService.of({ runRssWorker });
  }),
);
