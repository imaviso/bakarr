import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { rssFeeds } from "@/db/schema.ts";
import { BackgroundSearchRssFeedService } from "@/features/operations/background-search-rss-feed-service.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { OperationsProgress } from "@/features/operations/operations-progress-service.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";

export interface SearchBackgroundRssServiceShape {
  readonly runRssCheck: () => Effect.Effect<
    { readonly newItems: number; readonly totalFeeds: number },
    DatabaseError | OperationsInfrastructureError | ExternalCallError
  >;
}

export class SearchBackgroundRssService extends Context.Tag(
  "@bakarr/api/SearchBackgroundRssService",
)<SearchBackgroundRssService, SearchBackgroundRssServiceShape>() {}

export const SearchBackgroundRssServiceLive = Layer.effect(
  SearchBackgroundRssService,
  Effect.gen(function* () {
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
        let newItems = 0;

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

    return SearchBackgroundRssService.of({ runRssCheck });
  }),
);
