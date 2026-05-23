import { eq } from "drizzle-orm";
import { Effect, Ref } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { rssFeeds } from "@/db/schema.ts";
import { BackgroundSearchRssFeedService } from "@/features/operations/background-search/background-search-rss-feed-service.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";

export interface SearchBackgroundRssServiceShape {
  readonly runRssCheck: () => Effect.Effect<
    { readonly newItems: number; readonly totalFeeds: number },
    DatabaseError | OperationsInfrastructureError | ExternalCallError
  >;
}

export class SearchBackgroundRssService extends Effect.Service<SearchBackgroundRssService>()(
  "@bakarr/api/SearchBackgroundRssService",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* Database;
      const progress = yield* OperationsProgress;
      const rssFeedService = yield* BackgroundSearchRssFeedService;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

      const runRssCheck = Effect.fn("OperationsService.runRssCheck")(function* () {
        return yield* Effect.gen(function* () {
          const feeds = yield* tryDatabasePromise("Failed to run RSS check", () =>
            db.select().from(rssFeeds).where(eq(rssFeeds.enabled, true)),
          );
          const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig();
          const startedFeedsRef = yield* Ref.make(0);

          const processRssFeed = Effect.fn("operations.rss.feed")(function* (
            feed: (typeof feeds)[number],
          ) {
            const current = yield* Ref.modify(startedFeedsRef, (value) => [value + 1, value + 1]);
            yield* progress.publishRssCheckProgress({
              current,
              total: feeds.length,
              feed_name: feed.name ?? feed.url,
            });

            return yield* rssFeedService.processFeed(feed, runtimeConfig);
          });

          const feedNewItemCounts = yield* Effect.forEach(feeds, processRssFeed, {
            concurrency: 4,
          });
          const newItems = feedNewItemCounts.reduce((total, count) => total + count, 0);

          return { newItems, totalFeeds: feeds.length } as const;
        }).pipe(
          Effect.withSpan("operations.rss.check"),
          Effect.mapError((error) =>
            error instanceof DatabaseError ||
            error instanceof ExternalCallError ||
            error instanceof OperationsInfrastructureError
              ? error
              : new OperationsInfrastructureError({
                  message: "Failed to run RSS check",
                  cause: error,
                }),
          ),
          Effect.catchAllDefect((defect) =>
            Effect.fail(
              new OperationsInfrastructureError({
                message: "Failed to run RSS check",
                cause: defect,
              }),
            ),
          ),
        );
      });

      return { runRssCheck } satisfies SearchBackgroundRssServiceShape;
    }),
  },
) {}

export const SearchBackgroundRssServiceLive = SearchBackgroundRssService.Default;
