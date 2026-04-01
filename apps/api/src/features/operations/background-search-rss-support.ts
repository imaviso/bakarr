import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { rssFeeds } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import {
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
} from "@/features/operations/job-support.ts";
import { loadRuntimeConfig } from "@/features/operations/repository/config-repository.ts";
import { BackgroundSearchRssFeedService } from "@/features/operations/background-search-rss-feed-service.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { OperationsProgress } from "@/features/operations/operations-progress-service.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export interface SearchBackgroundRssServiceShape {
  readonly runRssCheck: () => Effect.Effect<void, DatabaseError | OperationsInfrastructureError>;
}

export class SearchBackgroundRssService extends Context.Tag(
  "@bakarr/api/SearchBackgroundRssService",
)<SearchBackgroundRssService, SearchBackgroundRssServiceShape>() {}

export const SearchBackgroundRssServiceLive = Layer.effect(
  SearchBackgroundRssService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const clock = yield* ClockService;
    const progress = yield* OperationsProgress;
    const rssFeedService = yield* BackgroundSearchRssFeedService;
    const nowIso = () => nowIsoFromClock(clock);

    const runRssCheckBase = Effect.fn("OperationsService.runRssCheckBase")(function* () {
      yield* markJobStarted(db, "rss", nowIso);

      return yield* Effect.gen(function* () {
        const feeds = yield* tryDatabasePromise("Failed to run RSS check", () =>
          db.select().from(rssFeeds).where(eq(rssFeeds.enabled, true)),
        );
        const runtimeConfig = yield* loadRuntimeConfig(db);
        let newItems = 0;

        yield* eventBus.publish({ type: "RssCheckStarted" });

        const processRssFeed = Effect.fn("operations.rss.feed")(function* (
          feed: (typeof feeds)[number],
          _index: number,
        ) {
          return yield* rssFeedService.processFeed(feed, runtimeConfig);
        });

        for (const [index, feed] of feeds.entries()) {
          yield* progress.publishRssCheckProgress({
            current: index + 1,
            total: feeds.length,
            feed_name: feed.name ?? feed.url,
          });

          newItems += yield* processRssFeed(feed, index);
        }

        yield* markJobSucceeded(db, "rss", `Queued ${newItems} release(s)`, nowIso);
        yield* eventBus.publish({
          type: "RssCheckFinished",
          payload: { new_items: newItems, total_feeds: feeds.length },
        });
        yield* progress.publishDownloadProgress();

        return { newItems };
      }).pipe(
        Effect.withSpan("operations.rss.check"),
        Effect.catchTag("DatabaseError", (error) =>
          markJobFailed(db, "rss", error, nowIso).pipe(Effect.zipRight(Effect.fail(error))),
        ),
        Effect.catchTag("OperationsInfrastructureError", (error) =>
          markJobFailed(db, "rss", error, nowIso).pipe(Effect.zipRight(Effect.fail(error))),
        ),
        Effect.catchAll((cause) =>
          markJobFailed(db, "rss", cause, nowIso).pipe(
            Effect.zipRight(
              Effect.fail(
                new OperationsInfrastructureError({
                  message: "Failed to run RSS check",
                  cause,
                }),
              ),
            ),
          ),
        ),
      );
    });

    const runRssCheck = Effect.fn("OperationsService.runRssCheck")(function* () {
      return yield* runRssCheckBase().pipe(
        Effect.mapError((error) =>
          error instanceof DatabaseError
            ? error
            : new OperationsInfrastructureError({
                message: "Failed to run RSS check",
                cause: error,
              }),
        ),
      );
    });

    return SearchBackgroundRssService.of({ runRssCheck });
  }),
);
